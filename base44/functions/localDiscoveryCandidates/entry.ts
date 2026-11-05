import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { nearbySearch, placeDetails, isGolfRelated } from '../../shared/googlePlaces.ts';
import { SHERMAN_IMPORT_CENTER, normalizeWebsiteUrl, haversineMi } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';

// ============================================================
// localDiscoveryCandidates — admin-only.
//
// Sources venues AROUND the center from Google Places instead of a
// model web search. Places returns a real street address, coordinates
// and place_id for every result, so a lead can never arrive without
// an address, and results are geographically bounded by construction.
//
// Places is a LEAD SOURCE ONLY. Every venue still runs the full
// official-source gate (its own page must corroborate identity, the
// address, the category, and it must not be closed). Nothing is
// published: a venue that passes becomes status 'pending' and waits
// for the admin's approval.
//
// Bounded per call: 7 lane searches + at most `limit` venue
// evaluations. No OpenAI calls.
// ============================================================

const JOB_KEY = 'local-sherman-v1';
const IMPORT_RADIUS_MI = 30;
const MAX_EVALUATIONS = 10;

const LANES = [
  { category: 'course', type: 'golf_course', keyword: null },
  { category: 'indoor_simulator', type: null, keyword: 'golf simulator' },
  { category: 'driving_range', type: null, keyword: 'driving range' },
  { category: 'entertainment_golf', type: null, keyword: 'golf lounge' },
  { category: 'mini_golf', type: null, keyword: 'mini golf' },
  { category: 'golf_instruction', type: null, keyword: 'golf lessons' },
  { category: 'golf_retail_fitting', type: null, keyword: 'golf shop' },
];

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

function comp(components: any[], type: string): string {
  const c = (components || []).find((x: any) => (x.types || []).includes(type));
  return c ? c.long_name || c.short_name || '' : '';
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
    const limit = Math.min(Math.max(Math.floor(Number(body.limit) || 6), 1), MAX_EVALUATIONS);

    const key = secrets.get('GOOGLE_PLACES_API_KEY') || '';
    if (!key) {
      return Response.json(
        { error: 'missing_places_key', message: 'GOOGLE_PLACES_API_KEY is not configured.' },
        { status: 400 }
      );
    }

    const center = SHERMAN_IMPORT_CENTER;
    const radiusM = Math.round(IMPORT_RADIUS_MI * 1609.34);

    // 1. Source every lane around the center.
    const found = new Map<string, { category: string }>();
    for (const lane of LANES) {
      const results = await nearbySearch(key, center.lat, center.lng, radiusM, lane.type, lane.keyword).catch(
        () => []
      );
      for (const r of results) {
        if (!r?.place_id || found.has(r.place_id)) continue;
        // Keyword searches surface hotels, retail and offices. Keep only
        // businesses whose own listing carries a golf signal.
        if (!isGolfRelated({ name: r.name, types: r.types }).isGolf) continue;
        const loc = r.geometry?.location;
        if (!loc) continue;
        // The API widens a keyword search beyond the radius; keep the
        // queue genuinely local by measuring the result itself.
        if (haversineMi(center.lat, center.lng, loc.lat, loc.lng) > IMPORT_RADIUS_MI) continue;
        found.set(r.place_id, { category: lane.category });
      }
    }

    // 2. Skip anything already evaluated or already listed.
    const existingListings = asItems(
      await base44.asServiceRole.entities.Listing
        .filter({ status: { $nin: ['archived', 'rejected', 'flagged'] } })
        .catch(() => [])
    );
    const placedIds = new Set(existingListings.map((l) => l.place_id).filter(Boolean));

    const prior = asItems(
      await base44.asServiceRole.entities.DiscoveryCandidate
        .filter({ source_provenance: 'google_places+official_website' }, { sort: '-created_date', limit: 200 })
        .catch(() => [])
    );
    const evaluated = new Set(prior.map((c) => parseJson(c.evidence_json)?.place_id).filter(Boolean));

    const pendingPlaces = Array.from(found.entries()).filter(
      ([placeId]) => !placedIds.has(placeId) && !evaluated.has(placeId)
    );
    const queue = pendingPlaces.slice(0, limit);

    const results: any[] = [];
    let awaiting = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const [placeId, lane] of queue) {
      const det = await placeDetails(key, placeId).catch(() => null);
      if (!det) continue;

      const website = normalizeWebsiteUrl(det.website);
      const lead = {
        name: det.name || '',
        category: lane.category,
        city: comp(det.address_components, 'locality') || comp(det.address_components, 'postal_town'),
        state: comp(det.address_components, 'administrative_area_level_1'),
        address: det.formatted_address || '',
        website,
        phone: det.formatted_phone_number || '',
        latitude: det.geometry?.location?.lat ?? null,
        longitude: det.geometry?.location?.lng ?? null,
      };

      const verified = await verifyLeadAgainstOfficialSource({
        lead,
        placesKey: key,
        center,
        radiusMi: IMPORT_RADIUS_MI,
        existingListings,
        requireSearchEvidence: false,
        jobId: JOB_KEY,
      });
      const ev = verified.evaluation;
      const now = new Date().toISOString();

      const passed = ev.status === 'accepted';
      const status = passed ? 'pending' : ev.status === 'duplicate' ? 'duplicate' : 'rejected';
      if (passed) awaiting++;
      else if (status === 'duplicate') duplicates++;
      else rejected++;

      await base44.asServiceRole.entities.DiscoveryCandidate.create({
        job_id: JOB_KEY,
        name: lead.name,
        discovery_category: ev.discoveryCategory || lane.category,
        city: verified.lead.city || '',
        state: verified.lead.state || '',
        address: verified.lead.address || '',
        latitude: ev.coordinates?.lat ?? lead.latitude,
        longitude: ev.coordinates?.lng ?? lead.longitude,
        distance_miles: ev.distanceMiles ?? null,
        official_website: website,
        booking_url: ev.listing?.booking_url || '',
        source_url: website,
        source_provenance: 'google_places+official_website',
        dedup_key: ev.dedupKey,
        status,
        private_reason: passed ? 'verified — awaiting your approval' : ev.reason,
        evidence_json: JSON.stringify({
          place_id: placeId,
          checks: ev.checks,
          address_resolution: verified.resolved
            ? { method: verified.resolved.method, address: verified.resolved.address }
            : null,
        }).slice(0, 9000),
        photos_json: '[]',
        verified_at: now,
      });

      results.push({
        name: lead.name,
        status,
        address: verified.lead.address || '',
        distance_miles: ev.distanceMiles ?? null,
        reason: ev.reason,
      });
    }

    return Response.json({
      places_found: found.size,
      evaluated: queue.length,
      awaiting_approval: awaiting,
      duplicates,
      rejected,
      remaining: Math.max(0, pendingPlaces.length - queue.length),
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}