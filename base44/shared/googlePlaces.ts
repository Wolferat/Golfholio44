// Shared Google Places helpers for seed + live-search backend functions.

export function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocode any address string (zip, city, place) to { lat, lng } via Google Geocoding API.
export async function geocode(key, address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export async function nearbySearch(key, lat, lng, radiusM, type, keyword) {
  const params = new URLSearchParams({ location: `${lat},${lng}`, radius: String(radiusM), key });
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status);
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

export async function placeDetails(key, placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: 'name,formatted_address,formatted_phone_number,website,rating,photos,geometry,address_components',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const data = await res.json();
  return data.result || null;
}

export async function uploadPhoto(base44, key, photoRef) {
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

export function buildListingRecord(det, type, placeId, centerLat, centerLng) {
  const city = component(det.address_components, 'locality') || component(det.address_components, 'postal_town') || '';
  const state = component(det.address_components, 'administrative_area_level_1') || '';
  const lat = det.geometry?.location?.lat ?? null;
  const lng = det.geometry?.location?.lng ?? null;
  let distance = null;
  if (lat != null && lng != null && centerLat != null) {
    distance = Math.round(haversineMi(centerLat, centerLng, lat, lng) * 10) / 10;
  }
  return {
    name: det.name,
    type,
    venue_name: det.name,
    city,
    state,
    address: det.formatted_address || '',
    latitude: lat,
    longitude: lng,
    phone: det.formatted_phone_number || '',
    website: det.website || '',
    description: `${type === 'course' ? 'Golf course' : 'Golf simulator / range'}${distance != null ? ' — ' + distance + ' mi away.' : ''}`,
    photos: [],
    rating: typeof det.rating === 'number' ? det.rating : null,
    place_id: placeId,
    status: 'approved',
  };
}

// Run the 3 searches (courses, simulators, ranges) and return deduped candidates keyed by place_id.
export async function collectAreaCandidates(key, lat, lng, radiusM) {
  const seen = new Map();
  const courseRes = await nearbySearch(key, lat, lng, radiusM, 'golf_course', null);
  for (const r of courseRes) if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'course' });
  const simRes = await nearbySearch(key, lat, lng, radiusM, null, 'golf simulator');
  for (const r of simRes) if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator' });
  const rangeRes = await nearbySearch(key, lat, lng, radiusM, null, 'driving range');
  for (const r of rangeRes) if (!seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator' });
  return { seen, counts: { courses: courseRes.length, simulators: simRes.length, ranges: rangeRes.length } };
}

// Enrich candidates via Place Details, upload first photo, bulkCreate new venues (skip existing place_ids).
// cap: optional max new records (null = no cap). Returns { created, photoErrors, totalArea, alreadyCached }.
export async function enrichAndCache(base44, key, seen, centerLat, centerLng, cap) {
  const existing = await base44.asServiceRole.entities.Listing.filter({});
  const existingPlaceIds = new Set((existing || []).map((l) => l.place_id).filter(Boolean));

  const candidates = [];
  for (const [placeId, info] of seen) {
    if (existingPlaceIds.has(placeId)) continue;
    candidates.push({ placeId, type: info.type });
    if (cap != null && candidates.length >= cap) break;
  }

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
    } catch { photoErrors++; }
    const rec = buildListingRecord(det, c.type, c.placeId, centerLat, centerLng);
    if (photoUrl) rec.photos = [photoUrl];
    records.push(rec);
  }

  let created = 0;
  if (records.length) {
    const res = await base44.asServiceRole.entities.Listing.bulkCreate(records);
    created = Array.isArray(res) ? res.length : (res?.length || records.length);
  }
  return { created, photoErrors, totalArea: seen.size, alreadyCached: existingPlaceIds.size };
}