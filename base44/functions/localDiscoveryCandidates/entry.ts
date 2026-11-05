import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { nearbySearch, placeDetails, isGolfRelated } from '../../shared/googlePlaces.ts';
import { SHERMAN_IMPORT_CENTER, normalizeWebsiteUrl, haversineMi } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';
import { evaluatePlacesOnlyApproval } from '../../shared/placesAnchoredApproval.ts';
import { MAX_WEBSITE_LOOKUPS_PER_SCAN, usableWebsite } from '../../shared/venueEnrichment.ts';

// ============================================================
// localDiscoveryCandidates — admin-only.
//
// Sources venues AROUND the center from Google Places instead of a
// model web search. Places returns a real street address, coordinates
// and place_id for every result, so a lead can never arrive without
// an address, and results are geographically bounded by construction.
//
// Every venue is then enriched from BOTH sources before the gates run:
// the Google Business Profile supplies the canonical address, phone,
// rating and review count, and a bounded web search fills in an official
// website when Google has none. The candidate the admin sees therefore
// carries every fact needed to decide it in one look.
//
// Nothing is published here. A venue that passes every automated gate
// becomes status 'pending'. A real, Places-anchored golf venue whose own
// page could not confirm every check ALSO becomes 'pending', with the
// exact failing check recorded — that is the admin's decision to make,
// not a silent rejection.
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
    const openaiKey = secrets.get('OPENAI_API_KEY') || '';

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
    let needsReview = 0;
    let duplicates = 0;
    let rejected = 0;
    let websiteLookups = 0;

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
        place_id: placeId,
      };

      const verified = await verifyLeadAgainstOfficialSource({
        lead,
        placesKey: key,
        openaiKey,
        // Only venues that arrived with no website from either source spend
        // a paid search, and only up to the per-scan ceiling.
        allowWebsiteSearch: !website && websiteLookups < MAX_WEBSITE_LOOKUPS_PER_SCAN,
        center,
        radiusMi: IMPORT_RADIUS_MI,
        existingListings,
        requireSearchEvidence: false,
        jobId: JOB_KEY,
      });
      if (verified.enrichment?.searched) websiteLookups++;

      const ev = verified.evaluation;
      const place = verified.enrichment?.place || null;
      const officialWebsite =
        usableWebsite(verified.website) || usableWebsite(place?.listing_website) || '';
      const phone = verified.lead.phone || place?.phone || det.formatted_phone_number || '';
      const rating = place?.rating ?? (typeof det.rating === 'number' ? det.rating : null);
      const reviewCount =
        place?.review_count ?? (typeof det.user_ratings_total === 'number' ? det.user_ratings_total : null);
      const address = verified.lead.address || place?.formatted_address || lead.address || '';
      const coords = ev.coordinates || { lat: lead.latitude, lng: lead.longitude };
      const now = new Date().toISOString();

      // The one-look dossier this admin decides from: a real golf venue
      // anchored to a Google place_id, with a street address, contact
      // details and a website whenever one exists.
      const placesOnly = evaluatePlacesOnlyApproval({
        name: lead.name,
        category: ev.discoveryCategory || lane.category,
        city: verified.lead.city || lead.city || '',
        state: verified.lead.state || lead.state || '',
        address,
        phone,
        placeId: place?.place_id || placeId,
        latitude: coords?.lat ?? place?.lat ?? null,
        longitude: coords?.lng ?? place?.lng ?? null,
        placeTypes: place?.types || det.types || [],
        website: officialWebsite,
        rating,
        center,
        radiusMi: IMPORT_RADIUS_MI,
        existingListings,
        adminId: user.id,
        jobId: JOB_KEY,
        nowIso: now,
      });

      const passed = ev.status === 'accepted';
      const isDuplicate =
        ev.status === 'duplicate' || String(placesOnly.reason || '').startsWith('already listed');
      const status = isDuplicate ? 'duplicate' : passed || placesOnly.ok ? 'pending' : 'rejected';
      // When the decisive fact is the venue's own location or an existing
      // listing, say that — not an earlier check it would have passed.
      const decidedByPlaces =
        String(placesOnly.reason || '').startsWith('out of import radius') ||
        String(placesOnly.reason || '').startsWith('already listed');
      const reason = passed
        ? 'verified — awaiting your approval'
        : status === 'pending'
          ? `needs your call: ${ev.reason}`
          : decidedByPlaces
            ? placesOnly.reason
            : ev.reason || placesOnly.reason;

      if (status === 'pending' && passed) awaiting++;
      else if (status === 'pending') needsReview++;
      else if (status === 'duplicate') duplicates++;
      else rejected++;

      await base44.asServiceRole.entities.DiscoveryCandidate.create({
        job_id: JOB_KEY,
        name: lead.name,
        discovery_category: ev.discoveryCategory || lane.category,
        city: verified.lead.city || lead.city || '',
        state: verified.lead.state || lead.state || '',
        address,
        latitude: coords?.lat ?? place?.lat ?? lead.latitude,
        longitude: coords?.lng ?? place?.lng ?? lead.longitude,
        distance_miles: ev.distanceMiles ?? placesOnly.distanceMiles ?? null,
        phone,
        rating,
        review_count: reviewCount,
        place_id: place?.place_id || placeId,
        official_website: officialWebsite,
        booking_url: ev.listing?.booking_url || '',
        source_url:
          officialWebsite || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        source_provenance: 'google_places+official_website',
        dedup_key: ev.dedupKey,
        status,
        private_reason: reason,
        evidence_json: JSON.stringify({
          place_id: placeId,
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
        address,
        website: officialWebsite,
        phone,
        distance_miles: ev.distanceMiles ?? placesOnly.distanceMiles ?? null,
        reason,
      });
    }

    return Response.json({
      places_found: found.size,
      evaluated: queue.length,
      awaiting_approval: awaiting,
      needs_your_review: needsReview,
      duplicates,
      rejected,
      website_lookups_used: websiteLookups,
      remaining: Math.max(0, pendingPlaces.length - queue.length),
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}