import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Sherman, TX center for the 30-mile first run
const CENTER = { lat: 33.6357, lng: -96.6086 };
const RADIUS_M = 48280; // 30 miles
const MAX_VENUES = 25;

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nearbySearch(key, type, keyword) {
  const params = new URLSearchParams({
    location: `${CENTER.lat},${CENTER.lng}`,
    radius: String(RADIUS_M),
    key,
  });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return { _error: data.status, _msg: data.error_message || data.status, _results: [] };
  }
  let results = data.results || [];
  let nextToken = data.next_page_token;
  while (nextToken) {
    await new Promise((r) => setTimeout(r, 2500));
    const pr = new URLSearchParams({ pagetoken: nextToken, key });
    const pres = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${pr}`);
    const pdata = await pres.json();
    results = results.concat(pdata.results || []);
    nextToken = pdata.next_page_token;
  }
  return results;
}

async function placeDetails(key, placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: 'name,formatted_address,formatted_phone_number,website,rating,photos,geometry,address_components',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const data = await res.json();
  return data.result || null;
}

async function uploadPhoto(base44, key, photoRef) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob || blob.size === 0) return null;
  const file = new File([blob], `venue-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
  const out = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
  return out.file_url || null;
}

function component(components, type) {
  const c = (components || []).find((x) => (x.types || []).includes(type));
  return c ? c.long_name || c.short_name : null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const key = secrets.get('GOOGLE_PLACES_API_KEY');
    if (!key) return Response.json({ error: 'GOOGLE_PLACES_API_KEY not set' }, { status: 500 });

    // Collect unique place_ids across three searches; first occurrence wins the type
    const seen = new Map(); // place_id -> { type, base }
    const courseRes = await nearbySearch(key, 'golf_course', null);
    const courseArr = Array.isArray(courseRes) ? courseRes : [];
    if (courseRes?._error) return Response.json({ error: 'course search: ' + courseRes._msg, stage: 'nearby_course' }, { status: 500 });
    for (const r of courseArr) {
      if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'course', base: r });
    }
    const simRes = await nearbySearch(key, null, 'golf simulator');
    const simArr = Array.isArray(simRes) ? simRes : [];
    if (simRes?._error) return Response.json({ error: 'simulator search: ' + simRes._msg, stage: 'nearby_simulator' }, { status: 500 });
    for (const r of simArr) {
      if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator', base: r });
    }
    const rangeRes = await nearbySearch(key, null, 'driving range');
    const rangeArr = Array.isArray(rangeRes) ? rangeRes : [];
    if (rangeRes?._error) return Response.json({ error: 'range search: ' + rangeRes._msg, stage: 'nearby_range' }, { status: 500 });
    for (const r of rangeArr) {
      if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator', base: r });
    }

    // Skip venues already seeded (by place_id) so re-runs don't duplicate
    const existing = await base44.asServiceRole.entities.Listing.filter({});
    const existingPlaceIds = new Set((existing || []).map((l) => l.place_id).filter(Boolean));

    const candidates = [];
    for (const [placeId, info] of seen) {
      if (existingPlaceIds.has(placeId)) continue;
      candidates.push({ placeId, type: info.type });
      if (candidates.length >= MAX_VENUES) break;
    }

    // Enrich in parallel (Place Details)
    const details = await Promise.all(candidates.map((c) => placeDetails(key, c.placeId).catch(() => null)));

    const records = [];
    let photoErrors = 0;
    for (let i = 0; i < candidates.length; i++) {
      const det = details[i];
      if (!det) continue;
      const c = candidates[i];
      let photoUrl = null;
      try {
        const ref = det.photos && det.photos[0] && det.photos[0].photo_reference;
        if (ref) photoUrl = await uploadPhoto(base44, key, ref);
      } catch {
        photoErrors++;
      }
      const city = component(det.address_components, 'locality') || component(det.address_components, 'postal_town') || '';
      const state = component(det.address_components, 'administrative_area_level_1') || '';
      const lat = det.geometry?.location?.lat ?? null;
      const lng = det.geometry?.location?.lng ?? null;
      let distance = null;
      if (lat != null && lng != null) {
        distance = Math.round(haversineMi(CENTER.lat, CENTER.lng, lat, lng) * 10) / 10;
      }
      records.push({
        name: det.name,
        type: c.type,
        venue_name: det.name,
        city,
        state,
        address: det.formatted_address || '',
        latitude: lat,
        longitude: lng,
        phone: det.formatted_phone_number || '',
        website: det.website || '',
        description: `${c.type === 'course' ? 'Golf course' : c.type === 'simulator' ? 'Golf simulator / range' : 'Golf venue'} near Sherman, TX — ${distance != null ? distance + ' mi away.' : ''}`.trim(),
        photos: photoUrl ? [photoUrl] : [],
        rating: typeof det.rating === 'number' ? det.rating : null,
        place_id: c.placeId,
        status: 'approved',
      });
    }

    let created = 0;
    if (records.length) {
      const res = await base44.asServiceRole.entities.Listing.bulkCreate(records);
      created = Array.isArray(res) ? res.length : (res?.length || records.length);
    }

    return Response.json({
      searches: { courses: courseArr.length, simulators: simArr.length, ranges: rangeArr.length },
      unique: seen.size,
      skipped: existingPlaceIds.size,
      created,
      photoErrors,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}