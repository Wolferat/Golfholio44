import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import { checkPublicListing, publicPhoto } from '../../shared/publicListingPolicy.ts';

// Server-only, admin-only, read-only diagnostic. Given a player
// location (lat/lng or a geocodable "near" string), it reports exactly
// what the player Explore feed would contain and why every excluded
// record is excluded — pass/fail for every required policy condition
// and the first failing reason. It never modifies any record and is
// not exposed to normal users.
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

    const records = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' });

    const feed = [];
    const excluded = [];
    for (const r of records) {
      const chk = checkPublicListing(r, centerLat, centerLng);
      if (chk.pass) {
        feed.push({
          id: r.id,
          name: r.name,
          type: r.type,
          distance: chk.distance,
          photo: publicPhoto(r),
        });
      } else {
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

    return Response.json({
      endpoint: '/functions/getGolfListings',
      playerLocation: { lat: centerLat, lng: centerLng },
      radiusMiles: 15,
      feedCount: feed.length,
      excludedCount: excluded.length,
      feed,
      excluded,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}