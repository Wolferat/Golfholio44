import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// ============================================================
// Resolve Location — geocode and reverse-geocode for player
// location selection.
//
// Accepts:
//   - { lat, lng } → reverse geocode to city/state
//   - { query: "city, state" or "ZIP" } → forward geocode to
//     coordinates + city/state
//
// Returns:
//   - { results: [{ city, state, lat, lng, displayName }] }
//   - Multiple results when ambiguous (player chooses)
//
// Does NOT trigger Google Places discovery, AI discovery, bulk
// enrichment, or background listing creation. This function only
// resolves a location string/coordinates to a city/state.
// ============================================================

function extractCityState(result) {
  const components = result.address_components || [];
  const city =
    components.find((c) => c.types.includes('locality'))?.long_name ||
    components.find((c) => c.types.includes('postal_town'))?.long_name ||
    components.find((c) => c.types.includes('administrative_area_level_2'))?.long_name ||
    '';
  const state =
    components.find((c) => c.types.includes('administrative_area_level_1'))?.short_name ||
    '';
  const lat = result.geometry?.location?.lat ?? null;
  const lng = result.geometry?.location?.lng ?? null;
  return { city, state, lat, lng };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Require an authenticated player session
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const query = (body.query || '').trim();

    const key = secrets.get('GOOGLE_PLACES_API_KEY');
    if (!key) return Response.json({ error: 'Location service unavailable' }, { status: 503 });

    let url;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      // Reverse geocode
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    } else if (query) {
      // Forward geocode (city name or ZIP)
      url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
    } else {
      return Response.json({ error: 'Provide lat/lng or query' }, { status: 400 });
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return Response.json({
        results: [],
        status: data.status || 'NO_RESULTS',
      });
    }

    // Build results, deduplicating by city+state
    const seen = new Set();
    const results = [];
    for (const r of data.results) {
      const { city, state, lat: rLat, lng: rLng } = extractCityState(r);
      if (!city || !state || rLat == null || rLng == null) continue;
      const key2 = `${city}|${state}`.toLowerCase();
      if (seen.has(key2)) continue;
      seen.add(key2);
      results.push({
        city,
        state,
        lat: rLat,
        lng: rLng,
        displayName: `${city}, ${state}`,
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}