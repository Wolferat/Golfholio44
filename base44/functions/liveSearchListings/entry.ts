import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode, collectAreaCandidates, enrichAndCache, dryRunEnrich } from '../../shared/googlePlaces.ts';

const SHERMAN = { lat: 33.6357, lng: -96.6086 };
const RADIUS_M = 24140; // 15 miles

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only: discovery writes must never run for ordinary users
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const key = secrets.get('GOOGLE_PLACES_API_KEY');
    if (!key) return Response.json({ error: 'GOOGLE_PLACES_API_KEY not set' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const zip = (body.zip || '').trim();
    const near = (body.near || '').trim();
    const dryRun = body.dry_run === true;

    // Server-validated cap: 1-3 only for manual test searches
    let cap = body.cap != null ? Number(body.cap) : null;
    if (cap == null || isNaN(cap) || cap < 1 || cap > 3) {
      return Response.json({ error: 'cap is required and must be between 1 and 3' }, { status: 400 });
    }
    cap = Math.floor(cap);

    let center = SHERMAN;
    if (lat != null && lng != null) center = { lat, lng };
    else if (zip) center = await geocode(key, zip);
    else if (near) center = await geocode(key, near);

    if (!center) center = SHERMAN;

    const { seen, counts } = await collectAreaCandidates(key, center.lat, center.lng, RADIUS_M);

    if (dryRun) {
      const result = await dryRunEnrich(key, seen, center.lat, center.lng, cap);
      return Response.json({ dry_run: true, searches: counts, ...result });
    }

    const result = await enrichAndCache(base44, key, seen, center.lat, center.lng, cap, 'liveSearchListings');
    return Response.json({ dry_run: false, searches: counts, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}