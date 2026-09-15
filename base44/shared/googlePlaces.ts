// Shared Google Places helpers for seed + live-search backend functions.
// Phase 1: Safe intake — no auto-approval, golf-only filtering, no photo re-hosting.

export function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  // Phase 1: cap at 20 results per search to control API cost
  return (data.results || []).slice(0, 20);
}

export async function placeDetails(key, placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: 'name,formatted_address,formatted_phone_number,website,rating,photos,geometry,address_components,types',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const data = await res.json();
  return data.result || null;
}

// ============================================================
// GOLF-SPECIFIC FILTERING — reject non-golf before storage
// ============================================================

const GOLF_PLACE_TYPES = new Set(['golf_course']);

const GOLF_NAME_KEYWORDS = [
  'golf', 'driving range', 'putt', 'mini golf', 'pitch & putt', 'pitch and putt',
  'country club', 'links', 'fairway', 'tee box', 'simulator', 'golf center',
  'golf academy', 'golf training', 'golf practice', 'golf instruction',
  'golf club', 'golf course', 'golf ranch', 'golf resort',
];

const NON_GOLF_NAME_PATTERNS = [
  'church', 'cathedral', 'ministry', 'temple', 'mosque', 'synagogue',
  'school', 'isd', 'elementary', 'middle school', 'high school', 'university', 'college',
  'hospital', 'medical', 'clinic', 'urgent care', 'dental', 'pharmacy',
  'cemetery', 'memorial park', 'funeral', 'mortuary',
  'restaurant', 'cafe', 'coffee', 'bar and grill', 'bbq', 'pizza', 'taco',
  'hotel', 'motel', 'inn ', 'resort and spa',
  'gas station', 'convenience store', 'grocery', 'supermarket', 'walmart', 'target',
  'home depot', 'lowes', 'hardware',
  'apartment', 'real estate', 'realtor', 'property management',
  'auto', 'car wash', 'tire', 'automotive',
  'storage', 'warehouse',
];

export function isGolfRelated(place) {
  const name = (place.name || '').toLowerCase();
  const types = place.types || [];

  const hasGolfType = types.some((t) => GOLF_PLACE_TYPES.has(t));
  const hasGolfKeyword = GOLF_NAME_KEYWORDS.some((kw) => name.includes(kw));
  const hasNonGolfPattern = NON_GOLF_NAME_PATTERNS.some((p) => name.includes(p));

  if (hasGolfType && !hasNonGolfPattern) {
    return { isGolf: true, reason: 'golf_course place type' };
  }
  if (hasGolfKeyword && !hasNonGolfPattern) {
    return { isGolf: true, reason: 'golf keyword in name' };
  }
  if (hasGolfType && hasNonGolfPattern) {
    return { isGolf: false, reason: 'golf type but non-golf name' };
  }
  if (hasGolfKeyword && hasNonGolfPattern) {
    return { isGolf: false, reason: 'mixed golf/non-golf signals' };
  }
  return { isGolf: false, reason: 'no golf signal' };
}

export function assignVerificationTier(det) {
  if (det.website) return 3; // Google Business Profile with website
  return 5; // Unverified
}

function component(components, type) {
  const c = (components || []).find((x) => (x.types || []).includes(type));
  return c ? c.long_name || c.short_name : null;
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function buildListingRecord(det, type, placeId, centerLat, centerLng) {
  const city = component(det.address_components, 'locality') || component(det.address_components, 'postal_town') || '';
  const state = component(det.address_components, 'administrative_area_level_1') || '';
  const lat = det.geometry?.location?.lat ?? null;
  const lng = det.geometry?.location?.lng ?? null;
  const verificationTier = assignVerificationTier(det);

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
    official_website: det.website || '',
    description: '',
    photos: [],
    rating: typeof det.rating === 'number' ? det.rating : null,
    place_id: placeId,
    status: 'pending',
    source_url: det.website || '',
    source_type: 'google_places',
    verification_tier: verificationTier,
    verification_notes: 'Auto-discovered via Google Places — pending admin review',
    verified_at: null,
    verified_by: null,
    official_registration_url: '',
    is_professional_tournament: false,
    photo_source: null,
    photo_verified: false,
    photo_source_url: null,
  };
}

export function isDuplicate(candidate, existingRecords) {
  const candName = normalizeName(candidate.name);
  const candDomain = getDomain(candidate.website || candidate.official_website);
  const candAddr = (candidate.address || '').toLowerCase().trim();

  for (const existing of existingRecords) {
    if (candidate.place_id && existing.place_id === candidate.place_id) {
      return { isDup: true, reason: 'same place_id' };
    }
    if (candDomain) {
      const existDomain = getDomain(existing.website || existing.official_website);
      if (existDomain && existDomain === candDomain) {
        return { isDup: true, reason: 'same website domain' };
      }
    }
    if (candName && candName === normalizeName(existing.name) && (candidate.city || '') === (existing.city || '')) {
      return { isDup: true, reason: 'same name + city' };
    }
    if (candAddr && candAddr === (existing.address || '').toLowerCase().trim()) {
      return { isDup: true, reason: 'same address' };
    }
    if (candidate.latitude != null && candidate.longitude != null && existing.latitude != null && existing.longitude != null) {
      const dist = haversineMi(candidate.latitude, candidate.longitude, existing.latitude, existing.longitude);
      if (dist < 0.1 && candName === normalizeName(existing.name)) {
        return { isDup: true, reason: 'same location + name' };
      }
    }
  }
  return { isDup: false };
}

export async function collectAreaCandidates(key, lat, lng, radiusM) {
  const seen = new Map();
  let counts = { courses: 0, simulators: 0, ranges: 0 };

  const courseRes = await nearbySearch(key, lat, lng, radiusM, 'golf_course', null);
  for (const r of courseRes) {
    const check = isGolfRelated(r);
    if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'course' });
  }
  counts.courses = courseRes.length;

  const simRes = await nearbySearch(key, lat, lng, radiusM, null, 'golf simulator');
  for (const r of simRes) {
    const check = isGolfRelated(r);
    if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator' });
  }
  counts.simulators = simRes.length;

  const rangeRes = await nearbySearch(key, lat, lng, radiusM, null, 'driving range');
  for (const r of rangeRes) {
    const check = isGolfRelated(r);
    if (check.isGolf && !seen.has(r.place_id)) seen.set(r.place_id, { type: 'simulator' });
  }
  counts.ranges = rangeRes.length;

  return { seen, counts };
}

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
  let rejected = 0;
  let duplicates = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const det = details[i];
    if (!det) { skipped++; continue; }
    const c = candidates[i];

    const golfCheck = isGolfRelated(det);
    if (!golfCheck.isGolf) { rejected++; continue; }

    const rec = buildListingRecord(det, c.type, c.placeId, centerLat, centerLng);

    const dupCheck = isDuplicate(rec, existing);
    if (dupCheck.isDup) { duplicates++; continue; }

    records.push(rec);
  }

  let created = 0;
  if (records.length) {
    const res = await base44.asServiceRole.entities.Listing.bulkCreate(records);
    created = Array.isArray(res) ? res.length : (res?.length || records.length);
  }

  return {
    created,
    skipped,
    rejected,
    duplicates,
    totalArea: seen.size,
    alreadyCached: existingPlaceIds.size,
  };
}