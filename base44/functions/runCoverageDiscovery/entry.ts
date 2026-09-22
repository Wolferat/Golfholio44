import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { nearbySearch, placeDetails, isGolfRelated, isDuplicate, haversineMi } from '../../shared/googlePlaces.ts';
import { isTrustedSourceUrl } from '../../shared/publicListingPolicy.ts';
import { corroborateSourceUrl, validatePublicUrl } from '../../shared/automatedVerification.ts';
import { computeBackoff } from '../../shared/coverageArea.ts';
import { createCoverageNotification } from '../../shared/notifications.ts';

// ============================================================
// runCoverageDiscovery — admin/server-side discovery engine.
//
// Processes QUEUED coverage requests: discovers golf candidates
// via Google Places, verifies each against its official website,
// and creates APPROVED listings only when every permanent policy
// condition is objectively satisfied.
//
// This function is NOT triggered by player actions. It is called
// by an admin or a workflow (which is INACTIVE during this build).
//
// Safety:
//   - Bounded: max 20 candidates, 20 place details, 20 source fetches
//   - SSRF-hardened source fetching (validatePublicUrl + corroborateSourceUrl)
//   - Source allowlist (trusted URLs only, no Google Maps/social/directory)
//   - LLM classifies evidence only — never invents fields
//   - Fails closed on ambiguity, unsafe sources, or inconsistency
//   - Stores private audit reasons (never player-visible)
//   - Creates APPROVED listings only when fully verified
//   - Rejected candidates tracked by place_id for dedup
// ============================================================

const MAX_CANDIDATES = 20;
const CONCURRENCY = 3;

function getCityState(components: any[]): { city: string; state: string } {
  const city = components?.find((c) => c.types?.includes('locality'))?.long_name ||
    components?.find((c) => c.types?.includes('postal_town'))?.long_name || '';
  const state = components?.find((c) => c.types?.includes('administrative_area_level_1'))?.short_name || '';
  return { city, state };
}

async function classifyWithLLM(base44: any, det: any): Promise<any | null> {
  try {
    return await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a golf venue classification assistant. Based ONLY on the evidence below, classify this venue.

Venue name: ${det.name}
Address: ${det.formatted_address || ''}
Google Places types: ${(det.types || []).join(', ')}

Return:
1. is_golf: true if this is clearly a golf-related business (course, driving range, simulator, training, golf-related venue)
2. category: one of "course", "simulator", "training", "golf_related_venue"
3. reason: brief explanation

Rules:
- Use ONLY the evidence above. Do NOT invent information.
- If the evidence is ambiguous, return is_golf: false.
- "course" = physical golf course with holes
- "simulator" = indoor golf simulator facility
- "training" = golf instruction/training facility
- "golf_related_venue" = other golf-related business`,
      response_json_schema: {
        type: 'object',
        properties: {
          is_golf: { type: 'boolean' },
          category: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    });
  } catch {
    return null;
  }
}

// Process a single candidate with the full verification contract.
// Returns { accepted, placeId, name, reason } so the caller can
// aggregate results without shared mutable state during parallel
// execution.
async function processCandidate(base44: any, googleKey: string, placeId: string, info: any, existingListings: any[], coverageId: string) {
  const det = await placeDetails(googleKey, placeId).catch(() => null);
  if (!det) {
    return { accepted: false, placeId, name: null, reason: 'place details fetch failed' };
  }

  const golfCheck = isGolfRelated(det);
  if (!golfCheck.isGolf) {
    return { accepted: false, placeId, name: det.name, reason: `not golf-related: ${golfCheck.reason}` };
  }

  const website = det.website;
  if (!website || !isTrustedSourceUrl(website)) {
    return { accepted: false, placeId, name: det.name, reason: 'no trusted official website' };
  }

  const sourceCheck = await validatePublicUrl(website);
  if (!sourceCheck.valid) {
    return { accepted: false, placeId, name: det.name, reason: `source URL blocked: ${sourceCheck.reason}` };
  }

  const { city, state } = getCityState(det.address_components);
  const candidateRecord = {
    name: det.name,
    type: info.type,
    place_id: placeId,
    website,
    address: det.formatted_address || '',
    city,
    latitude: det.geometry?.location?.lat,
    longitude: det.geometry?.location?.lng,
  };

  const dupCheck = isDuplicate(candidateRecord, existingListings);
  if (dupCheck.isDup) {
    return { accepted: false, placeId, name: det.name, reason: `duplicate: ${dupCheck.reason}` };
  }

  const corroboration = await corroborateSourceUrl(website, {
    name: det.name,
    city,
    address: det.formatted_address || '',
    phone: det.formatted_phone_number || '',
  });

  if (!corroboration.corroborated) {
    return { accepted: false, placeId, name: det.name, reason: `source not corroborated: ${corroboration.reason}` };
  }

  const llmResult = await classifyWithLLM(base44, det);
  if (!llmResult || !llmResult.is_golf) {
    return { accepted: false, placeId, name: det.name, reason: llmResult?.reason || 'LLM classified as non-golf' };
  }

  const category = ['course', 'simulator', 'training', 'golf_related_venue'].includes(llmResult.category)
    ? llmResult.category
    : info.type;

  const now = new Date().toISOString();
  await base44.asServiceRole.entities.Listing.create({
    name: det.name,
    type: category,
    venue_name: det.name,
    city,
    state,
    address: det.formatted_address || '',
    latitude: det.geometry?.location?.lat ?? null,
    longitude: det.geometry?.location?.lng ?? null,
    phone: det.formatted_phone_number || '',
    website,
    official_website: website,
    description: '',
    photos: [],
    rating: typeof det.rating === 'number' ? det.rating : null,
    place_id: placeId,
    status: 'approved',
    source_url: website,
    source_type: 'official_website',
    ingestion_source: 'coverage_discovery',
    ingestion_job_id: coverageId,
    verification_tier: 2,
    verification_notes: `Automated: ${llmResult.reason}. Source corroborated: ${corroboration.reason}`,
    verified_at: now,
    verified_by: 'coverage_discovery',
    golf_verified: true,
    golf_verified_at: now,
    golf_verified_by: 'coverage_discovery',
    photo_verified: false,
    is_professional_tournament: false,
  });

  return { accepted: true, placeId, name: det.name };
}

async function processCoverageRequest(base44: any, coverage: any) {
  const coverageId = coverage.id;
  const lat = Number(coverage.latitude);
  const lng = Number(coverage.longitude);
  const radius = Math.min(Math.max(Number(coverage.radius_miles) || 15, 1), 30);
  const radiusM = Math.round(radius * 1609.34);

  // Set status to checking
  await base44.asServiceRole.entities.CoverageRequest.update(coverageId, {
    status: 'checking',
    last_run_at: new Date().toISOString(),
  }).catch(() => {});

  const exclusionReasons: any[] = [];
  let acceptedCount = 0;
  let candidatesFound = 0;

  try {
    const googleKey = secrets.get('GOOGLE_PLACES_API_KEY');
    if (!googleKey) throw new Error('Google Places API key not available');

    // Step 1: Discover candidates via Google Places (bounded)
    const seen = new Map<string, { type: string; place: any }>();

    const courseRes = await nearbySearch(googleKey, lat, lng, radiusM, 'golf_course', null);
    for (const r of courseRes) {
      const check = isGolfRelated(r);
      if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'course', place: r });
    }

    const simRes = await nearbySearch(googleKey, lat, lng, radiusM, null, 'golf simulator');
    for (const r of simRes) {
      const check = isGolfRelated(r);
      if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator', place: r });
    }

    const rangeRes = await nearbySearch(googleKey, lat, lng, radiusM, null, 'driving range');
    for (const r of rangeRes) {
      const check = isGolfRelated(r);
      if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator', place: r });
    }

    candidatesFound = seen.size;

    // Step 2: Get existing listings for dedup
    const existingListings = await base44.asServiceRole.entities.Listing.filter({}).catch(() => []);

    // Step 3: Process candidates with bounded parallelism (max 20,
    // concurrency 3). Each candidate runs the full verification
    // contract independently — no checks are skipped or weakened.
    const candidates = Array.from(seen.entries()).slice(0, MAX_CANDIDATES);

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(([placeId, info]) =>
          processCandidate(base44, googleKey, placeId, info, existingListings, coverageId)
        )
      );
      for (const r of results) {
        if (r.accepted) {
          acceptedCount++;
        } else {
          exclusionReasons.push({ place_id: r.placeId, name: r.name, reason: r.reason });
        }
      }
    }

    // Count verified listings in area and collect their IDs
    const allApproved = await base44.asServiceRole.entities.Listing
      .filter({ status: 'approved', golf_verified: true })
      .catch(() => []);
    const verifiedIds: string[] = [];
    for (const l of allApproved) {
      if (l.latitude != null && l.longitude != null) {
        const dist = haversineMi(lat, lng, l.latitude, l.longitude);
        if (dist <= radius) verifiedIds.push(l.id);
      }
    }
    const verifiedCount = verifiedIds.length;

    // Update coverage request
    const finalStatus = acceptedCount > 0 ? 'complete' : 'empty';
    const now = new Date().toISOString();
    const backoff = computeBackoff(coverage.retry_count || 0);
    await base44.asServiceRole.entities.CoverageRequest.update(coverageId, {
      status: finalStatus,
      last_completed_at: now,
      last_run_at: now,
      result_count: candidatesFound,
      accepted_count: acceptedCount,
      verified_count: verifiedCount,
      exclusion_reasons: JSON.stringify(exclusionReasons).slice(0, 10000),
      source_provenance_summary: 'google_places+official_website',
      next_eligible_at: new Date(Date.now() + backoff).toISOString(),
      retry_count: (coverage.retry_count || 0) + 1,
    }).catch(() => {});

    // Generate a deduped notification for the requesting player.
    // Only fires on terminal states (complete/empty) — never on
    // polls, retries, or intermediate states.
    await createCoverageNotification(
      base44,
      coverage.requested_by_id,
      coverage.area_key,
      coverage.area_label,
      coverage.canonical_city,
      coverage.canonical_state,
      finalStatus,
      verifiedIds
    ).catch(() => {});

    return {
      coverage_id: coverageId,
      status: finalStatus,
      candidates_found: candidatesFound,
      accepted: acceptedCount,
      excluded: exclusionReasons.length,
      verified_count: verifiedCount,
    };
  } catch (error: any) {
    // Fail closed
    const now = new Date().toISOString();
    const backoff = computeBackoff(coverage.retry_count || 0);
    await base44.asServiceRole.entities.CoverageRequest.update(coverageId, {
      status: 'failed',
      error_message: String(error.message || error).slice(0, 500),
      last_run_at: now,
      next_eligible_at: new Date(Date.now() + backoff).toISOString(),
      exclusion_reasons: JSON.stringify(exclusionReasons).slice(0, 10000),
    }).catch(() => {});

    // Generate a deduped "still working" notification for the
    // requesting player on failure.
    await createCoverageNotification(
      base44,
      coverage.requested_by_id,
      coverage.area_key,
      coverage.area_label,
      coverage.canonical_city,
      coverage.canonical_state,
      'failed',
      []
    ).catch(() => {});

    return { coverage_id: coverageId, status: 'failed', error: error.message };
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const coverageRequestId = body.coverage_request_id;

    let requests;
    if (coverageRequestId) {
      requests = await base44.asServiceRole.entities.CoverageRequest
        .filter({ id: coverageRequestId }).catch(() => []);
    } else {
      requests = await base44.asServiceRole.entities.CoverageRequest
        .filter({ status: 'queued' }).catch(() => []);
    }

    if (requests.length === 0) {
      return Response.json({ status: 'no_queued_requests', message: 'No queued coverage requests to process' });
    }

    const results = [];
    for (const coverage of requests) {
      const result = await processCoverageRequest(base44, coverage);
      results.push(result);
    }

    return Response.json({ status: 'completed', results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}