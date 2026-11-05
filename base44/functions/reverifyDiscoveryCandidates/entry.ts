import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { SHERMAN_IMPORT_CENTER, isUsableStreetAddress } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';
import { evaluatePlacesOnlyApproval } from '../../shared/placesAnchoredApproval.ts';
import { MAX_WEBSITE_LOOKUPS_PER_SCAN, usableWebsite } from '../../shared/venueEnrichment.ts';

// ============================================================
// reverifyDiscoveryCandidates — admin-only.
//
// Two kinds of candidate are re-checked:
//
//   1. Venues rejected ONLY because no street address was available.
//      They now get a resolved address before the gates run.
//   2. Candidates that were never enriched from both sources (no
//      Google place_id yet), including earlier rejections that predate
//      enrichment. These are re-evaluated with the Google Business
//      Profile facts attached, and — when the venue is real and
//      Places-anchored but one automated check could not be confirmed —
//      they become 'pending' so the admin can settle them in one look.
//
// Venues rejected for a decided reason with full data (out of radius,
// non-golf, closed) are never re-run.
//
// Nothing is published here. Every result still waits for the admin.
// ============================================================

const MAX_PER_CALL = 12;
const MAX_WEBSITE_LOOKUPS = 2;

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

// A candidate is only retryable while it still has NO street address.
// Once an address is resolved the resulting verdict is final — even
// when that verdict is a rejection — so nothing loops forever.
function isRetryableCandidate(candidate: any): boolean {
  return (
    !!candidate?.official_website &&
    !isUsableStreetAddress(candidate?.address) &&
    isRetryable(candidate?.private_reason)
  );
}

// A rejection that no amount of enrichment can change. Those are skipped so
// the re-check budget is spent only on undecided venues.
const DECIDED_PREFIXES = [
  'non-golf business signal',
  'out of scope',
  'excluded business type',
  'adult/unsafe',
  'out of import radius',
  'venue appears closed',
];

function isDecided(reason: any): boolean {
  const r = String(reason || '');
  return DECIDED_PREFIXES.some((p) => r.startsWith(p));
}

// Never enriched from both sources yet: the row predates enrichment, or
// its Google profile was never read.
function isUnenriched(candidate: any): boolean {
  return !String(candidate?.place_id || '').trim() && !isDecided(candidate?.private_reason);
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
    const openaiKey = secrets.get('OPENAI_API_KEY') || '';

    let radiusMi = 30;
    if (jobId) {
      const job = await base44.asServiceRole.entities.DiscoveryJob.get(jobId).catch(() => null);
      radiusMi = Number(job?.radius_miles) || 30;
    }

    const filter: any = { status: { $in: ['rejected', 'pending'] } };
    if (jobId) filter.job_id = jobId;
    const undecided = asItems(
      await base44.asServiceRole.entities.DiscoveryCandidate
        .filter(filter, { sort: '-created_date', limit: 300 })
        .catch(() => [])
    );

    // Unenriched rows first: those are the ones whose cards are still thin.
    const eligible = undecided.filter((c) => isUnenriched(c) || isRetryableCandidate(c));
    const ordered = [
      ...eligible.filter(isUnenriched),
      ...eligible.filter((c) => !isUnenriched(c)),
    ];

    // An explicit id list overrides the automatic selection: it is how a
    // specific venue is re-checked on demand.
    const requestedIds = Array.isArray(body.candidate_ids)
      ? body.candidate_ids.map((v: any) => String(v)).filter(Boolean).slice(0, MAX_PER_CALL)
      : [];
    const queue = requestedIds.length > 0
      ? undecided.filter((c) => requestedIds.includes(c.id))
      : ordered.slice(0, limit);

    const existingListings = asItems(
      await base44.asServiceRole.entities.Listing
        .filter({ status: { $nin: ['archived', 'rejected', 'flagged'] } })
        .catch(() => [])
    );

    const results: any[] = [];
    let nowAwaitingApproval = 0;
    let needsReview = 0;
    let stillRejected = 0;
    let websiteLookups = 0;

    for (const candidate of queue) {
      const evidence = parseJson(candidate.evidence_json);
      const website = usableWebsite(candidate.official_website);

      const verified = await verifyLeadAgainstOfficialSource({
        lead: {
          name: candidate.name,
          category: candidate.discovery_category,
          city: candidate.city,
          state: candidate.state,
          address: candidate.address,
          website,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          place_id: candidate.place_id || evidence?.place_id || '',
        },
        placesKey,
        openaiKey,
        allowWebsiteSearch: !website && websiteLookups < MAX_WEBSITE_LOOKUPS,
        center: SHERMAN_IMPORT_CENTER,
        radiusMi,
        existingListings,
        searchEvidenceUrls: evidence?.search?.evidence_urls || [],
        ...(String(candidate.source_provenance || '').includes('google_places')
          ? { requireSearchEvidence: false }
          : {}),
        jobId: candidate.job_id,
      });
      if (verified.enrichment?.searched) websiteLookups++;

      const ev = verified.evaluation;
      const place = verified.enrichment?.place || null;
      const officialWebsite =
        usableWebsite(verified.website) || usableWebsite(place?.listing_website) || website;
      const address = verified.lead.address || place?.formatted_address || candidate.address || '';
      const coords = ev.coordinates || { lat: candidate.latitude, lng: candidate.longitude };
      const now = new Date().toISOString();

      const placesOnly = evaluatePlacesOnlyApproval({
        name: candidate.name,
        category: ev.discoveryCategory || candidate.discovery_category,
        city: verified.lead.city || candidate.city || '',
        state: verified.lead.state || candidate.state || '',
        address,
        phone: verified.lead.phone || place?.phone || '',
        placeId: place?.place_id || String(evidence?.place_id || ''),
        latitude: coords?.lat ?? place?.lat ?? null,
        longitude: coords?.lng ?? place?.lng ?? null,
        placeTypes: place?.types || [],
        website: officialWebsite,
        rating: place?.rating ?? null,
        center: SHERMAN_IMPORT_CENTER,
        radiusMi,
        existingListings,
        adminId: user.id,
        jobId: candidate.job_id,
        nowIso: now,
      });

      const passed = ev.status === 'accepted';
      const isDuplicate =
        ev.status === 'duplicate' || String(placesOnly.reason || '').startsWith('already listed');
      const status = isDuplicate ? 'duplicate' : passed || placesOnly.ok ? 'pending' : 'rejected';

      const reason = passed
        ? 'verified — awaiting your approval'
        : status === 'pending'
          ? `needs your call: ${ev.reason}`
          : isDecided(placesOnly.reason) || isDuplicate
            ? placesOnly.reason
            : ev.reason || placesOnly.reason;

      const patch: any = {
        status,
        address,
        city: verified.lead.city || candidate.city || '',
        state: verified.lead.state || candidate.state || '',
        latitude: coords?.lat ?? place?.lat ?? candidate.latitude ?? null,
        longitude: coords?.lng ?? place?.lng ?? candidate.longitude ?? null,
        distance_miles: ev.distanceMiles ?? placesOnly.distanceMiles ?? candidate.distance_miles ?? null,
        phone: verified.lead.phone || place?.phone || candidate.phone || '',
        rating: place?.rating ?? candidate.rating ?? null,
        review_count: place?.review_count ?? candidate.review_count ?? null,
        place_id: place?.place_id || candidate.place_id || String(evidence?.place_id || ''),
        official_website: officialWebsite,
        private_reason: reason,
        evidence_json: JSON.stringify({
          place_id: place?.place_id || String(evidence?.place_id || ''),
          checks: ev.checks,
          website_source: verified.enrichment?.website_source || '',
          conflicts: verified.enrichment?.conflicts || [],
          google_profile: place
            ? {
                name: place.name,
                address: place.formatted_address,
                phone: place.phone,
                rating: place.rating,
                reviews: place.review_count,
              }
            : null,
          search: evidence?.search || null,
          address_resolution: verified.resolved
            ? { method: verified.resolved.method, address: verified.resolved.address }
            : null,
          reverified_at: now,
        }).slice(0, 9000),
        verified_at: now,
      };

      if (status === 'pending' && passed) nowAwaitingApproval++;
      else if (status === 'pending') needsReview++;
      else stillRejected++;

      const updated = await base44.asServiceRole.entities.DiscoveryCandidate.update(candidate.id, patch);

      results.push({
        id: candidate.id,
        name: candidate.name,
        status: updated.status,
        address,
        website: officialWebsite,
        phone: patch.phone,
        address_method: verified.resolved?.method || 'none',
        reason,
      });
    }

    return Response.json({
      checked: queue.length,
      now_awaiting_approval: nowAwaitingApproval + needsReview,
      needs_your_review: needsReview,
      still_rejected: stillRejected,
      website_lookups_used: websiteLookups,
      retryable_remaining: Math.max(0, ordered.length - queue.length),
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}