import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode, collectAreaCandidates, enrichAndCache } from '../../shared/googlePlaces.ts';

const RADIUS_M = 48280; // 30 miles

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const key = secrets.get('GOOGLE_PLACES_API_KEY');
    if (!key) return Response.json({ error: 'GOOGLE_PLACES_API_KEY not set' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const zip = (body.zip || '').trim();
    const near = (body.near || '').trim();

    let center = null;
    if (lat != null && lng != null) center = { lat, lng };
    else if (zip) center = await geocode(key, zip);
    else if (near) center = await geocode(key, near);
    if (!center) return Response.json({ error: 'Provide lat/lng, zip, or near' }, { status: 400 });

    const { seen, counts } = await collectAreaCandidates(key, center.lat, center.lng, RADIUS_M);
    const result = await enrichAndCache(base44, key, seen, center.lat, center.lng, null);
    return Response.json({ searches: counts, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}