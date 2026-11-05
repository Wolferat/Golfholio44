import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import {
  SHERMAN_IMPORT_CENTER,
  DEFAULT_OPENAI_MODEL,
  MAX_LEADS_PER_QUERY,
  MAX_SOURCE_FETCHES_PER_QUERY,
  clampImportRadius,
  clampMaxCalls,
  clampMaxCandidates,
  decodePlannedQuery,
  encodePlannedQuery,
  planQueryPlan,
  callOpenAIWebSearch,
  assertApiKeyPresent,
} from '../../shared/openaiDiscovery.ts';
import { collectVerifiedPhotos } from '../../shared/officialSourceVerification.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';
import { COST_CAP_USD, estimateJobCost } from '../../shared/usageBudget.ts';

// ============================================================
// shermanDiscoveryRun — admin-only, one-time, resumable import.
//
// Actions:
//   create — requires explicit confirmation string and a present
//            OPENAI_API_KEY; creates a running job.
//   step   — processes EXACTLY ONE planned query, then checkpoints.
//   stop   — sets the stop flag.
//   status — returns the job, summary, and candidates.
//
// Safety:
//   - Hard per-run ceilings on OpenAI calls and candidates
//   - One query per invocation so runs are short and resumable
//   - Fails closed on missing key, API error, refusal, malformed
//     output, or incomplete response
//   - A source-fetch failure leaves a candidate pending, never
//     approved
//   - Approvals require officialSourceVerification + the existing
//     publicListingPolicy gate
//   - No workflow, cron, or scheduled recurrence is created
// ============================================================

const JOB_KEY = 'sherman-tx-evergreen-v1';
const CONFIRM_PHRASE = 'RUN_SHERMAN_DISCOVERY';
const TERMINAL = new Set(['stopped', 'completed', 'completed_with_ceiling', 'failed']);

function asItems(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

async function loadJobCandidates(base44: any, jobId: string) {
  const res = await base44.asServiceRole.entities.DiscoveryCandidate
    .filter({ job_id: jobId }, { sort: '-created_date', limit: 60 })
    .catch(() => []);
  return asItems(res);
}

async function buildSummary(base44: any, job: any, status: string, note = '') {
  const planned = (job.planned_queries || []).map((q: string) => decodePlannedQuery(q));
  const completed = Math.min(Number(job.query_index) || 0, planned.length);
  return {
    queries_total: planned.length,
    queries_completed: completed,
    queries_unrun: planned.slice(completed).map((q: any) => q.query),
    openai_calls_used: Number(job.openai_calls_used) || 0,
    openai_input_tokens: Number(job.openai_input_tokens) || 0,
    openai_output_tokens: Number(job.openai_output_tokens) || 0,
    source_fetches_used: Number(job.source_fetches_used) || 0,
    candidates_found: Number(job.candidates_found) || 0,
    accepted: Number(job.accepted_count) || 0,
    pending: Number(job.pending_count) || 0,
    rejected: Number(job.rejected_count) || 0,
    duplicate: Number(job.duplicate_count) || 0,
    truncated_leads: Number(job.truncated_leads) || 0,
    estimated_cost_usd: estimateJobCost(job),
    cost_cap_usd: COST_CAP_USD,
    remaining_cost_usd: Math.max(0, Math.round((COST_CAP_USD - estimateJobCost(job)) * 10000) / 10000),
    ceiling_hit: status === 'completed_with_ceiling',
    note,
  };
}

async function finalizeJob(base44: any, job: any, status: string, note = '', lastError = '') {
  const summary = await buildSummary(base44, job, status, note);
  await base44.asServiceRole.entities.DiscoveryJob.update(job.id, {
    status,
    completed_at: new Date().toISOString(),
    summary_json: JSON.stringify(summary).slice(0, 20000),
    last_error: lastError || job.last_error || '',
  });
  return await base44.asServiceRole.entities.DiscoveryJob.get(job.id);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();

    // ---------------- CREATE ----------------
    if (action === 'create') {
      if (body.confirm !== CONFIRM_PHRASE) {
        return Response.json(
          { error: 'confirmation_required', required_confirm: CONFIRM_PHRASE },
          { status: 400 }
        );
      }

      const apiKey = secrets.get('OPENAI_API_KEY');
      if (!assertApiKeyPresent(apiKey)) {
        return Response.json(
          {
            error: 'missing_openai_key',
            message: 'OPENAI_API_KEY is not configured. Add it in Base44 Secrets before executing.',
          },
          { status: 400 }
        );
      }

      const running = asItems(
        await base44.asServiceRole.entities.DiscoveryJob.filter({ status: 'running' }).catch(() => [])
      );
      if (running.length > 0) {
        return Response.json(
          { error: 'a_discovery_job_is_already_running', job_id: running[0].id },
          { status: 409 }
        );
      }

      const radius = clampImportRadius(body.radius_miles);
      const maxCalls = clampMaxCalls(body.max_openai_calls);
      const maxCandidates = clampMaxCandidates(body.max_candidates);
      const plan = planQueryPlan(radius);

      if (plan.queries.length === 0) {
        return Response.json({ error: 'no_planned_queries' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const job = await base44.asServiceRole.entities.DiscoveryJob.create({
        job_key: JOB_KEY,
        status: 'running',
        center_label: SHERMAN_IMPORT_CENTER.label,
        center_latitude: SHERMAN_IMPORT_CENTER.lat,
        center_longitude: SHERMAN_IMPORT_CENTER.lng,
        radius_miles: radius,
        openai_model: DEFAULT_OPENAI_MODEL,
        max_openai_calls: maxCalls,
        max_candidates: maxCandidates,
        planned_queries: plan.queries.map((q) => encodePlannedQuery(q.category, q.query)),
        query_index: 0,
        openai_calls_used: 0,
        openai_input_tokens: 0,
        openai_output_tokens: 0,
        source_fetches_used: 0,
        candidates_found: 0,
        accepted_count: 0,
        pending_count: 0,
        rejected_count: 0,
        duplicate_count: 0,
        truncated_leads: 0,
        stop_requested: false,
        confirmed_by: user.id,
        confirmed_at: now,
        started_at: now,
        last_error: '',
        summary_json: '',
      });

      return Response.json({
        job,
        summary: await buildSummary(base44, job, 'running'),
        candidates: [],
      });
    }

    // ---------------- STATUS / STOP / STEP need a job ----------------
    const jobId = String(body.job_id || '').trim();
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.DiscoveryJob
      .get(jobId)
      .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    if (action === 'status') {
      return Response.json({
        job,
        summary: await buildSummary(base44, job, job.status),
        candidates: await loadJobCandidates(base44, job.id),
      });
    }

    if (action === 'stop') {
      const updated = await base44.asServiceRole.entities.DiscoveryJob.update(job.id, {
        stop_requested: true,
      });
      return Response.json({
        stopped: true,
        job: updated,
        summary: await buildSummary(base44, updated, updated.status, 'stop requested'),
        candidates: await loadJobCandidates(base44, job.id),
      });
    }

    if (action === 'step') {
      if (TERMINAL.has(job.status)) {
        return Response.json({
          job,
          terminal: true,
          summary: await buildSummary(base44, job, job.status),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      if (job.stop_requested === true) {
        const stopped = await finalizeJob(base44, job, 'stopped', 'stopped by admin');
        return Response.json({
          job: stopped,
          terminal: true,
          summary: await buildSummary(base44, stopped, 'stopped'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      const planned = (job.planned_queries || []).map((q: string) => decodePlannedQuery(q));

      if ((Number(job.query_index) || 0) >= planned.length) {
        const done = await finalizeJob(base44, job, 'completed', 'all planned queries processed');
        return Response.json({
          job: done,
          terminal: true,
          summary: await buildSummary(base44, done, 'completed'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      if ((Number(job.openai_calls_used) || 0) >= (Number(job.max_openai_calls) || 0)) {
        const capped = await finalizeJob(
          base44,
          job,
          'completed_with_ceiling',
          'OpenAI call ceiling reached; unrun queries are listed in the summary'
        );
        return Response.json({
          job: capped,
          terminal: true,
          summary: await buildSummary(base44, capped, 'completed_with_ceiling'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      const apiKey = secrets.get('OPENAI_API_KEY');
      if (!assertApiKeyPresent(apiKey)) {
        const failed = await finalizeJob(base44, job, 'failed', 'missing OPENAI_API_KEY', 'missing_secret:OPENAI_API_KEY');
        return Response.json({
          job: failed,
          terminal: true,
          error: 'missing_openai_key',
          summary: await buildSummary(base44, failed, 'failed'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      // Hard spend ceiling: stop before spending, not after.
      if (estimateJobCost(job) >= COST_CAP_USD) {
        const capped = await finalizeJob(
          base44,
          job,
          'completed_with_ceiling',
          `$${COST_CAP_USD} spend cap reached; unrun queries are listed in the summary`
        );
        return Response.json({
          job: capped,
          terminal: true,
          summary: await buildSummary(base44, capped, 'completed_with_ceiling'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      // ---------------- ONE QUERY ----------------
      const current = planned[Number(job.query_index) || 0];
      const ai = await callOpenAIWebSearch(apiKey, current.query, job.openai_model || DEFAULT_OPENAI_MODEL);

      const step = {
        query: current.query,
        category: current.category,
        openai_ok: ai.ok,
        openai_reason: ai.reason,
        search_calls: ai.search_calls,
        search_evidence_urls: ai.evidence_urls.length,
        leads_returned: ai.leads.length,
        leads_truncated: Math.max(0, ai.leads.length - MAX_LEADS_PER_QUERY),
        source_fetches: 0,
        accepted: 0,
        pending: 0,
        blocked: 0,
        rejected: 0,
        duplicate: 0,
        errors: [] as string[],
      };

      const counters = {
        openai_calls_used: (Number(job.openai_calls_used) || 0) + 1,
        openai_input_tokens: (Number(job.openai_input_tokens) || 0) + (ai.usage.input_tokens || 0),
        openai_output_tokens: (Number(job.openai_output_tokens) || 0) + (ai.usage.output_tokens || 0),
        query_index: (Number(job.query_index) || 0) + 1,
        truncated_leads: (Number(job.truncated_leads) || 0) + step.leads_truncated,
      };

      if (!ai.ok) {
        const patch = {
          ...counters,
          status: 'failed',
          last_error: `openai_failed: ${ai.reason}`,
        };
        await base44.asServiceRole.entities.DiscoveryJob.update(job.id, patch);
        const finalized = await finalizeJob(
          base44,
          { ...job, ...patch },
          'failed',
          'OpenAI failed closed',
          `openai_failed: ${ai.reason}`
        );
        return Response.json({
          job: finalized,
          terminal: true,
          error: 'openai_failed',
          step,
          summary: await buildSummary(base44, { ...job, ...patch }, 'failed'),
          candidates: await loadJobCandidates(base44, job.id),
        });
      }

      const geocodeKey = secrets.get('GOOGLE_PLACES_API_KEY') || '';
      // Quarantined and rejected records must not block a genuine venue:
      // dedup matches on normalized name + city across every record.
      const existingListings = asItems(
        await base44.asServiceRole.entities.Listing
          .filter({ status: { $nin: ['archived', 'rejected', 'flagged'] } })
          .catch(() => [])
      );

      // Autonomous-mode kill switch. When auto_publish_enabled is false the
      // run still verifies every candidate but publishes nothing.
      const autoSetting = asItems(
        await base44.asServiceRole.entities.AppSetting.filter({ key: 'auto_publish_enabled' }).catch(() => [])
      )[0];
      const autoPublish = autoSetting ? autoSetting.enabled !== false : true;

      const leads = ai.leads.slice(0, MAX_LEADS_PER_QUERY);
      let candidatesFound = Number(job.candidates_found) || 0;
      let ceilingHit = false;

      for (const lead of leads) {
        if (candidatesFound >= (Number(job.max_candidates) || 0)) {
          ceilingHit = true;
          break;
        }

        try {
          // Fetch the official page, resolve a real street address for the
          // lead (leads often arrive with none), then run every gate.
          const verified = await verifyLeadAgainstOfficialSource({
            lead,
            placesKey: geocodeKey,
            center: SHERMAN_IMPORT_CENTER,
            radiusMi: Number(job.radius_miles) || 30,
            existingListings,
            searchEvidenceUrls: ai.evidence_urls,
            jobId: job.id,
            canFetchSource: step.source_fetches < MAX_SOURCE_FETCHES_PER_QUERY,
          });

          const website = verified.website;
          const doc = verified.doc;
          const evaluation = verified.evaluation;
          const resolvedLead = verified.lead;
          if (doc?.ok) step.source_fetches++;
          let geocoded = verified.resolved?.geocoded || null;

          const duplicateInJob = asItems(
            await base44.asServiceRole.entities.DiscoveryCandidate
              .filter({ job_id: job.id, dedup_key: evaluation.dedupKey })
              .catch(() => [])
          );

          candidatesFound++;
          if (duplicateInJob.length > 0) {
            step.duplicate++;
            continue;
          }

          const now = new Date().toISOString();
          // Fully autonomous: a failed gate is a rejection, not a review
          // request. Nothing waits on a human.
          const storedStatus = evaluation.status === 'pending' ? 'rejected' : evaluation.status;
          const candidate = await base44.asServiceRole.entities.DiscoveryCandidate.create({
            job_id: job.id,
            name: typeof lead.name === 'string' ? lead.name : '',
            discovery_category: evaluation.discoveryCategory,
            city: typeof resolvedLead.city === 'string' ? resolvedLead.city : '',
            state: typeof resolvedLead.state === 'string' ? resolvedLead.state : '',
            address: typeof resolvedLead.address === 'string' ? resolvedLead.address : '',
            latitude: evaluation.coordinates?.lat ?? null,
            longitude: evaluation.coordinates?.lng ?? null,
            distance_miles: evaluation.distanceMiles ?? null,
            official_website: website,
            booking_url: evaluation.listing?.booking_url || '',
            source_url: website,
            source_provenance: 'openai_web_search+official_website',
            dedup_key: evaluation.dedupKey,
            status: storedStatus,
            private_reason: evaluation.reason,
            evidence_json: JSON.stringify({
              checks: evaluation.checks,
              corroboration: evaluation.corroboration
                ? { reason: evaluation.corroboration.reason, evidence: evaluation.corroboration.evidence }
                : null,
              search: {
                calls: ai.search_calls,
                evidence_urls: ai.evidence_urls.slice(0, 25),
              },
              geocoded_address: geocoded
                ? {
                    formatted_address: geocoded.formatted_address || '',
                    postal_code: geocoded.postal_code || '',
                    street_line: geocoded.street_line || '',
                    latitude: geocoded.lat,
                    longitude: geocoded.lng,
                  }
                : null,
              coordinate_source: 'google_geocoding_official_address',
              address_resolution: verified.resolved
                ? { method: verified.resolved.method, address: verified.resolved.address }
                : null,
            }).slice(0, 9000),
            photos_json: '[]',
            verified_at: now,
          });

          if (evaluation.status === 'accepted' && evaluation.listing && !autoPublish) {
            // Verified and auto-approved, but the kill switch suppresses
            // every public write for this run.
            step.blocked++;
          } else if (evaluation.status === 'accepted' && evaluation.listing) {
            const listing = await base44.asServiceRole.entities.Listing.create(evaluation.listing);

            let acceptedPhotos: any[] = [];
            if (doc?.ok) {
              const photoResult = await collectVerifiedPhotos(doc.html, doc.finalUrl);
              acceptedPhotos = photoResult.accepted;
            }

            if (acceptedPhotos.length > 0) {
              await base44.asServiceRole.entities.OfficialPhoto.bulkCreate(
                acceptedPhotos.map((p, i) => ({
                  listing_id: listing.id,
                  listing_name: listing.name,
                  photo_url: p.photo_url,
                  source_url: p.source_url,
                  source_provider: 'official_website',
                  attribution: p.attribution,
                  validation_status: 'accepted',
                  validation_result: p.reason,
                  validation_time: now,
                  retry_count: 0,
                  is_cover: i === 0,
                  display_order: i,
                }))
              );

              // Photo verification is separate from listing verification.
              await base44.asServiceRole.entities.Listing.update(listing.id, {
                photos: acceptedPhotos.map((p) => p.photo_url),
                photo_verified: true,
                photo_source: 'official_website',
                photo_source_url: evaluation.listing.official_website,
              });
            }

            await base44.asServiceRole.entities.DiscoveryCandidate.update(candidate.id, {
              listing_id: listing.id,
              photos_json: JSON.stringify(acceptedPhotos.map((p) => p.photo_url)),
            });

            existingListings.push({ ...evaluation.listing, id: listing.id });
            step.accepted++;
          } else if (evaluation.status === 'pending') {
            // Reported as rejected in autonomous mode.
            step.rejected++;
          } else if (evaluation.status === 'duplicate') {
            step.duplicate++;
          } else {
            step.rejected++;
          }
        } catch (e: any) {
          // Never approve on an unexpected error.
          step.errors.push(`${String(lead?.name || 'candidate')}: ${String(e?.message || e)}`.slice(0, 300));
        }
      }

      // Absolute checkpoint values computed from the job as loaded at
      // the start of this step, so the checkpoint always advances.
      const patch = {
        openai_calls_used: (Number(job.openai_calls_used) || 0) + 1,
        openai_input_tokens: (Number(job.openai_input_tokens) || 0) + (ai.usage.input_tokens || 0),
        openai_output_tokens: (Number(job.openai_output_tokens) || 0) + (ai.usage.output_tokens || 0),
        query_index: (Number(job.query_index) || 0) + 1,
        truncated_leads: (Number(job.truncated_leads) || 0) + step.leads_truncated,
        source_fetches_used: (Number(job.source_fetches_used) || 0) + step.source_fetches,
        candidates_found: (Number(job.candidates_found) || 0) + step.accepted + step.pending + step.rejected + step.duplicate,
        accepted_count: (Number(job.accepted_count) || 0) + step.accepted,
        pending_count: (Number(job.pending_count) || 0) + step.pending,
        rejected_count: (Number(job.rejected_count) || 0) + step.rejected,
        duplicate_count: (Number(job.duplicate_count) || 0) + step.duplicate,
      };

      const nextIndex = patch.query_index;
      const callsUsed = patch.openai_calls_used;

      let nextStatus = 'running';
      let note = '';
      if (ceilingHit) {
        nextStatus = 'completed_with_ceiling';
        note = 'Candidate ceiling reached; remaining leads and queries were not processed and are reported in the summary';
      } else if (nextIndex >= planned.length) {
        nextStatus = 'completed';
        note = 'all planned queries processed';
      } else if (callsUsed >= (Number(job.max_openai_calls) || 0)) {
        nextStatus = 'completed_with_ceiling';
        note = 'OpenAI call ceiling reached; unrun queries are reported in the summary';
      } else if (estimateJobCost({ ...job, ...patch }) >= COST_CAP_USD) {
        nextStatus = 'completed_with_ceiling';
        note = `$${COST_CAP_USD} spend cap reached; unrun queries are reported in the summary`;
      }

      const patched = await base44.asServiceRole.entities.DiscoveryJob.update(job.id, {
        ...patch,
        status: nextStatus,
        last_error: step.errors.length > 0 ? step.errors.join(' | ').slice(0, 500) : '',
      });

      const nextJob = { ...job, ...patch, status: nextStatus };
      const finalJob = TERMINAL.has(nextStatus)
        ? await finalizeJob(base44, nextJob, nextStatus, note)
        : patched;

      // Compact step result: lets the import be driven query-by-query
      // without streaming the whole job and candidate table each time.
      if (body.terse === true) {
        return Response.json({
          terminal: TERMINAL.has(nextStatus),
          status: nextStatus,
          step,
          progress: {
            queries_completed: nextIndex,
            queries_total: planned.length,
            accepted: patch.accepted_count,
            rejected: patch.rejected_count,
            duplicate: patch.duplicate_count,
            candidates: patch.candidates_found,
            estimated_cost_usd: estimateJobCost({ ...job, ...patch }),
            cost_cap_usd: COST_CAP_USD,
            note,
          },
        });
      }

      return Response.json({
        job: finalJob,
        terminal: TERMINAL.has(nextStatus),
        step,
        summary: await buildSummary(base44, nextJob, nextStatus, note),
        candidates: await loadJobCandidates(base44, job.id),
      });
    }

    return Response.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}