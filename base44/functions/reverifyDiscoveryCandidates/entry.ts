import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { SHERMAN_IMPORT_CENTER } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';

// ============================================================
// reverifyDiscoveryCandidates — admin-only.
//
// Re-runs venues that were rejected ONLY because no street address
// was available to confirm (or because nothing could be corroborated
// without one). Those leads now get a resolved street address before
// the gates run, so a real venue can be judged on its merits.
//
// Venues rejected for a decided reason (out of radius, non-golf,
// closed, no official website) are never re-run — their reason does
// not change with better address data.
//
// No OpenAI calls: this costs address lookups only. A candidate that
// now passes becomes status 'pending' — verified and awaiting the
// admin's approval. Nothing is published here.
// ============================================================

const MAX_PER_CALL = 12;

// Only these rejection reasons are address-fixable.
const RETRYABLE_PREFIXES = [
  'official page did not corroborate',
  'official page does not confirm the address',
  'coordinates could not be corroborated',
  'no geocodable address',
];

function isRetryable(reason: any): boolean {
  const r = String(reason || '');
  return RETRYABLE_PREFIXES.some((p) => r.startsWith(p));
}

function asItems(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

function parseJson(value: any): any {
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
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
    const limit = Math.min(Math.max(Math.floor(Number(body.limit) || 6), 1), MAX_PER_CALL);
    const jobId = String(body.job_id || '').trim();

    const placesKey = secrets.get('GOOGLE_PLACES_API_KEY') || '';
    if (!placesKey) {
      return Response.json(
        { error: 'missing_places_key', message: 'GOOGLE_PLACES_API_KEY is not configured.' },
        { status: 400 }
      );
    }

    let radiusMi = 30;
    if (jobId) {
      const job = await base44.asServiceRole.entities.DiscoveryJob.get(jobId).catch(() => null);
      radiusMi = Number(job?.radius_miles) || 30;
    }

    const filter: any = { status: 'rejected' };
    if (jobId) filter.job_id = jobId;
    const rejected = asItems(
      await base44.asServiceRole.entities.DiscoveryCandidate
        .filter(filter, { sort: '-created_date', limit: 300 })
        .catch(() => [])
    );

    const retryable = rejected.filter((c) => isRetryable(c.private_reason) && c.official_website);
    const queue = retryable.slice(0, limit);

    const existingListings = asItems(
      await base44.asServiceRole.entities.Listing
        .filter({ status: { $nin: ['archived', 'rejected', 'flagged'] } })
        .catch(() => [])
    );

    const results: any[] = [];
    let nowAwaitingApproval = 0;
    let stillRejected = 0;

    for (const candidate of queue) {
      const evidence = parseJson(candidate.evidence_json);
      const verified = await verifyLeadAgainstOfficialSource({
        lead: {
          name: candidate.name,
          category: candidate.discovery_category,
          city: candidate.city,
          state: candidate.state,
          address: candidate.address,
          website: candidate.official_website,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
        placesKey,
        center: SHERMAN_IMPORT_CENTER,
        radiusMi,
        existingListings,
        searchEvidenceUrls: evidence?.search?.evidence_urls || [],
        jobId: candidate.job_id,
      });

      const ev = verified.evaluation;
      const now = new Date().toISOString();
      const passed = ev.status === 'accepted';

      const patch: any = {
        address: verified.lead.address || candidate.address || '',
        city: verified.lead.city || candidate.city || '',
        state: verified.lead.state || candidate.state || '',
        latitude: ev.coordinates?.lat ?? candidate.latitude ?? null,
        longitude: ev.coordinates?.lng ?? candidate.longitude ?? null,
        distance_miles: ev.distanceMiles ?? candidate.distance_miles ?? null,
        private_reason: passed ? 'verified — awaiting your approval' : ev.reason,
        evidence_json: JSON.stringify({
          checks: ev.checks,
          search: evidence?.search || null,
          address_resolution: verified.resolved
            ? { method: verified.resolved.method, address: verified.resolved.address }
            : null,
          reverified_at: now,
        }).slice(0, 9000),
        verified_at: now,
      };
      if (passed) {
        patch.status = 'pending';
        nowAwaitingApproval++;
      } else {
        stillRejected++;
      }

      const updated = await base44.asServiceRole.entities.DiscoveryCandidate.update(candidate.id, patch);

      results.push({
        id: candidate.id,
        name: candidate.name,
        status: updated.status,
        address: patch.address,
        address_method: verified.resolved?.method || 'none',
        reason: ev.reason,
      });
    }

    return Response.json({
      checked: queue.length,
      now_awaiting_approval: nowAwaitingApproval,
      still_rejected: stillRejected,
      retryable_remaining: Math.max(0, retryable.length - queue.length),
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}