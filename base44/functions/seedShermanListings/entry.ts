import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode, collectAreaCandidates, enrichAndCache } from '../../shared/googlePlaces.ts';

const SHERMAN = { lat: 33.6357, lng: -96.6086 };
const RADIUS_M = 24140; // 15 miles
const CAP = 25;

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
    const zip = (body.zip || '').trim();
    let center = SHERMAN;
    if (zip) {
      const g = await geocode(key, zip);
      if (!g) return Response.json({ error: 'Could not geocode: ' + zip }, { status: 500 });
      center = g;
    }

    const { seen, counts } = await collectAreaCandidates(key, center.lat, center.lng, RADIUS_M);
    const result = await enrichAndCache(base44, key, seen, center.lat, center.lng, CAP, 'seedShermanListings');
    return Response.json({ region: zip || 'Sherman, TX', searches: counts, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}