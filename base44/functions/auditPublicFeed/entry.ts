import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import { checkPublicListing, publicPhoto } from '../../shared/publicListingPolicy.ts';

// Server-only, admin-only, read-only diagnostic. Given a player location
// (lat/lng or a geocodable "near" string), it reports exactly what the
// player Explore feed would contain and why every excluded record is
// excluded — pass/fail for every required policy condition and the first
// failing reason.
//
// RECONCILIATION: Every unique Listing ID is in exactly one bucket —
// passing or excluded. The invariant is:
//   passing unique IDs + excluded unique IDs = total unique Listing IDs
// The function asserts this invariant and reports all three counts plus
// the full ID lists. It never modifies any record.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();

    let centerLat = null;
    let centerLng = null;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      centerLat = lat;
      centerLng = lng;
    } else if (near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) {
          centerLat = g.lat;
          centerLng = g.lng;
        }
      }
    }

    if (centerLat == null || centerLng == null) {
      return Response.json(
        { error: 'Player location required. Provide lat/lng or a geocodable near.' },
        { status: 400 }
      );
    }

    // Fetch ALL records — not just approved. Every unique Listing ID must
    // be in exactly one bucket: passing or excluded.
    const raw = await base44.asServiceRole.entities.Listing.filter({});

    // Deduplicate by Listing ID — the table must have exactly one row per
    // unique ID. Duplicates are reported but not double-counted.
    const seenIds = new Set();
    const records = [];
    let duplicateCount = 0;
    for (const r of raw) {
      if (!r.id || seenIds.has(r.id)) {
        duplicateCount++;
        continue;
      }
      seenIds.add(r.id);
      records.push(r);
    }
    const totalUnique = records.length;

    const feed = [];
    const excluded = [];
    const passingIds = new Set();
    const excludedIds = new Set();

    for (const r of records) {
      const chk = checkPublicListing(r, centerLat, centerLng);
      if (chk.pass) {
        passingIds.add(r.id);
        feed.push({
          id: r.id,
          name: r.name,
          type: r.type,
          distance: chk.distance,
          photo: publicPhoto(r),
        });
      } else {
        excludedIds.add(r.id);
        excluded.push({
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          golf_verified: r.golf_verified === true,
          verification_tier: r.verification_tier,
          source_url: r.source_url || null,
          firstFailingReason: chk.firstFailingReason,
          checks: chk.checks,
        });
      }
    }

    feed.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

    // Reconciliation invariant: passing + excluded MUST equal total unique.
    const passingPlusExcluded = passingIds.size + excludedIds.size;
    const reconciles = passingPlusExcluded === totalUnique;

    return Response.json({
      endpoint: '/functions/getGolfListings',
      playerLocation: { lat: centerLat, lng: centerLng },
      radiusMiles: 15,
      totalUniqueListings: totalUnique,
      duplicateRecordsDropped: duplicateCount,
      passingCount: passingIds.size,
      excludedCount: excludedIds.size,
      passingPlusExcluded,
      reconciles,
      passingIds: Array.from(passingIds),
      excludedIds: Array.from(excludedIds),
      feed,
      excluded,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}