import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import { fetchSourceDocument } from '../../shared/automatedVerification.ts';
import { isTrustedSourceUrl } from '../../shared/publicListingPolicy.ts';
import { isBlockedHost } from '../../shared/photoValidation.ts';
import {
  SHERMAN_IMPORT_CENTER,
  DEFAULT_OPENAI_MODEL,
  MAX_LEADS_PER_QUERY,
  planQueryPlan,
  callOpenAIWebSearch,
  assertApiKeyPresent,
  normalizeWebsiteUrl,
} from '../../shared/openaiDiscovery.ts';
import {
  evaluateLead,
  extractOfficialBookingUrl,
  collectVerifiedPhotos,
} from '../../shared/officialSourceVerification.ts';

// ============================================================
// shermanDiscoverySmokeTest — admin-only, ONE query, ONE OpenAI
// call, ZERO writes.
//
// Proves the hardened pipeline end to end against the live API
// without importing anything: it geocodes one lead, fetches the
// official page, runs the full trust gate, checks candidate
// photos, and reports the evidence and cost. No DiscoveryJob,
// DiscoveryCandidate, Listing or OfficialPhoto record is created.
//
// Spend is hard-capped at a single OpenAI call — the caller
// cannot raise it.
// ============================================================

const CONFIRM_PHRASE = 'RUN_SHERMAN_SMOKE_ONE_QUERY';
const MAX_LEADS_EVALUATED = 3;
const SMOKE_TILE = 'Sherman, TX';

// gpt-4.1-mini token rates (USD per 1M tokens). Web-search tool fees are
// billed separately by OpenAI and are NOT included in this estimate.
const INPUT_USD_PER_1M = 0.4;
const OUTPUT_USD_PER_1M = 1.6;

function estimateTokenUsd(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens / 1_000_000) * INPUT_USD_PER_1M + (outputTokens / 1_000_000) * OUTPUT_USD_PER_1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
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
    if (body.confirm !== CONFIRM_PHRASE) {
      return Response.json(
        { error: 'confirmation_required', required_confirm: CONFIRM_PHRASE },
        { status: 400 }
      );
    }

    const apiKey = secrets.get('OPENAI_API_KEY');
    if (!assertApiKeyPresent(apiKey)) {
      return Response.json(
        { error: 'missing_openai_key', message: 'OPENAI_API_KEY is not configured.' },
        { status: 400 }
      );
    }

    // Exactly one planned query. The caller may pick which one, never how many.
    const plan = planQueryPlan(30);
    const requestedCategory = String(body.category || 'course');
    const tileQueries = plan.queries.filter((q: any) => q.tile === SMOKE_TILE);
    const current =
      tileQueries.find((q: any) => q.category === requestedCategory) || tileQueries[0];
    if (!current) {
      return Response.json({ error: 'no_planned_query' }, { status: 400 });
    }

    // ---- The single, hard-capped OpenAI call ----
    const ai = await callOpenAIWebSearch(
      apiKey,
      current.query,
      DEFAULT_OPENAI_MODEL
    );

    const model = DEFAULT_OPENAI_MODEL;
    const cost = {
      openai_calls: 1,
      input_tokens: ai.usage.input_tokens,
      output_tokens: ai.usage.output_tokens,
      total_tokens: ai.usage.total_tokens,
      estimated_usd_tokens_only: estimateTokenUsd(ai.usage.input_tokens, ai.usage.output_tokens),
      note: 'Token cost only. OpenAI bills web-search tool calls separately.',
    };

    const searchCall = {
      query: current.query,
      category: current.category,
      model,
      calls_made: 1,
      web_search_calls: ai.search_calls,
      evidence_url_count: ai.evidence_urls.length,
      evidence_urls: ai.evidence_urls.slice(0, 20),
    };

    if (!ai.ok) {
      return Response.json({
        smoke: true,
        no_writes_made: true,
        openai_ok: false,
        openai_reason: ai.reason,
        search_call: searchCall,
        cost,
        decisions: [],
        note: 'Failed closed — nothing was evaluated or written.',
      });
    }

    const geocodeKey = secrets.get('GOOGLE_PLACES_API_KEY') || '';
    const listingsRes = await base44.asServiceRole.entities.Listing.filter({}).catch(() => []);
    const existingListings: any[] = Array.isArray(listingsRes)
      ? listingsRes
      : listingsRes?.items || [];

    const leads = ai.leads.slice(0, MAX_LEADS_EVALUATED);
    const decisions: any[] = [];

    for (const lead of leads) {
      const report: any = {
        name: typeof lead?.name === 'string' ? lead.name : '',
        model_category_claim: typeof lead?.category === 'string' ? lead.category : '',
        website: normalizeWebsiteUrl(lead?.website),
        geocoded_address: null,
        page: null,
        decision: 'pending',
        reason: '',
        checks: [],
        booking_url: '',
        photos: { accepted: [], rejected: [], checked: 0 },
      };

      try {
        const website = normalizeWebsiteUrl(lead.website);
        let doc: any = null;
        if (website && isTrustedSourceUrl(website) && !isBlockedHost(website)) {
          doc = await fetchSourceDocument(website);
        }

        report.page = doc
          ? {
              requested_url: website,
              ok: doc.ok,
              final_url: doc.finalUrl,
              http_status: doc.httpStatus || (doc.ok ? 200 : 0),
              text_length: doc.text ? doc.text.length : 0,
              error: doc.ok ? '' : doc.reason,
            }
          : { requested_url: website, ok: false, error: 'no supported official website' };

        let geocoded: any = null;
        if (geocodeKey && lead.address) {
          const g = await geocode(geocodeKey, String(lead.address)).catch(() => null);
          if (g && typeof g.lat === 'number' && typeof g.lng === 'number') geocoded = g;
        }
        report.geocoded_address = geocoded
          ? {
              input: String(lead.address || ''),
              formatted_address: geocoded.formatted_address || '',
              postal_code: geocoded.postal_code || '',
              street_line: geocoded.street_line || '',
              latitude: geocoded.lat,
              longitude: geocoded.lng,
            }
          : { input: String(lead.address || ''), error: 'geocoding failed' };

        const bookingUrl = doc?.ok ? extractOfficialBookingUrl(doc.html, doc.finalUrl) : '';
        report.booking_url = bookingUrl;

        const evaluation = evaluateLead({
          lead,
          pageText: doc?.ok ? doc.text : '',
          html: doc?.ok ? doc.html : '',
          sourceUrl: website,
          finalUrl: doc?.ok ? doc.finalUrl : website,
          center: SHERMAN_IMPORT_CENTER,
          radiusMi: 30,
          existingListings,
          geocoded,
          searchEvidenceUrls: ai.evidence_urls,
          bookingUrl,
        });

        report.decision = evaluation.status;
        report.reason = evaluation.reason;
        report.checks = {
          passed: evaluation.checks.filter((c: any) => c.pass).map((c: any) => c.key),
          failed: evaluation.checks
            .filter((c: any) => !c.pass)
            .map((c: any) => ({ key: c.key, reason: c.reason })),
        };
        report.resolved_category = evaluation.discoveryCategory;
        report.distance_miles = evaluation.distanceMiles;

        // Candidate photos are checked only when the venue passed every
        // gate. Nothing is stored.
        if (evaluation.status === 'accepted' && doc?.ok) {
          const photos = await collectVerifiedPhotos(doc.html, doc.finalUrl);
          report.photos.checked = photos.accepted.length + photos.rejected.length;
          report.photos.accepted = photos.accepted.map((p: any) => ({
            url: p.photo_url,
            attribution: p.attribution,
            reason: p.reason,
          }));
          report.photos.rejected = photos.rejected.slice(0, 3).map((p: any) => ({
            url: p.photo_url,
            reason: p.reason,
          }));
        }
      } catch (e: any) {
        report.decision = 'pending';
        report.reason = `evaluation error: ${String(e?.message || e)}`.slice(0, 300);
      }

      decisions.push(report);
    }

    const summary = {
      accepted: decisions.filter((d) => d.decision === 'accepted').length,
      pending: decisions.filter((d) => d.decision === 'pending').length,
      rejected: decisions.filter((d) => d.decision === 'rejected').length,
      duplicate: decisions.filter((d) => d.decision === 'duplicate').length,
      photos_accepted: decisions.reduce((n, d) => n + d.photos.accepted.length, 0),
    };

    // Full detail goes to the log stream; the HTTP body stays compact
    // enough to read in full.
    console.log(
      'SHERRMAN_SMOKE_FULL ' +
        JSON.stringify({ search_call: searchCall, decisions, cost, summary })
    );

    const compact = decisions.map((d) => ({
      name: d.name,
      website: d.website,
      page: `${d.page?.ok ? 'ok' : 'fail'} ${d.page?.http_status || ''}`.trim(),
      geo: d.geocoded_address
        ? d.geocoded_address.error
          ? d.geocoded_address.error
          : `${d.geocoded_address.street_line}, ${d.geocoded_address.postal_code}`
        : 'none',
      decision: d.decision,
      reason: d.reason,
      failed_checks: (d.checks?.failed || []).map((c: any) => c.key),
      photos: d.photos.accepted.map((p: any) => p.url),
      photos_rejected: d.photos.rejected.length,
    }));

    return Response.json({
      smoke: true,
      no_writes_made: true,
      openai_ok: true,
      search_call: {
        query: searchCall.query,
        model: searchCall.model,
        web_search_calls: searchCall.web_search_calls,
        evidence_urls: searchCall.evidence_urls,
      },
      leads_returned: ai.leads.length,
      leads_evaluated: decisions.length,
      decisions: compact,
      cost,
      summary,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}