// ============================================================
// Public Listing Policy — the single authoritative trust gate.
// SERVER-ONLY. Every player-facing listing endpoint MUST use this
// predicate. No frontend component may decide eligibility.
// No endpoint may return a broader raw collection and rely on the
// browser to filter it.
// ============================================================

const RADIUS_MI = 15;

const EVENT_TYPES = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);

const ALLOWED_TYPES = new Set([
  'course',
  'simulator',
  'training',
  'tournament',
  'charity_event',
  'corporate_event',
  'league',
  'golf_related_venue',
]);

const HIDDEN_STATUSES = new Set([
  'pending',
  'flagged',
  'rejected',
  'expired',
  'archived',
  'claimed',
]);

function haversineMi(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isValidUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Returns { distance } when the record is eligible to be shown to a player,
// or null when it must NOT be shown. Fail closed: any uncertainty → null.
export function evaluatePublicListing(record, playerLat, playerLng) {
  if (!record) return null;
  if (record.status !== 'approved') return null;
  if (HIDDEN_STATUSES.has(record.status)) return null;
  if (record.golf_verified !== true) return null;
  const tier = record.verification_tier;
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) return null;
  if (!isValidUrl(record.source_url)) return null;
  if (!ALLOWED_TYPES.has(record.type)) return null;
  if (!isNumber(record.latitude) || !isNumber(record.longitude)) return null;
  if (!isNumber(playerLat) || !isNumber(playerLng)) return null;
  const distance =
    Math.round(haversineMi(playerLat, playerLng, record.latitude, record.longitude) * 10) / 10;
  if (distance > RADIUS_MI) return null;
  if (EVENT_TYPES.has(record.type) && record.ends_at && new Date(record.ends_at) < new Date())
    return null;
  return { distance };
}

export function isPublicGolfholioListing(record, playerLat, playerLng) {
  return evaluatePublicListing(record, playerLat, playerLng) != null;
}

// Returns only a safe, player-facing photo URL or null. Never exposes
// unverified, reviewer, scraped, or unrelated cached cover photos.
export function publicPhoto(record) {
  if (!record) return null;
  if (record.photo_verified !== true) return null;
  if (!Array.isArray(record.photos) || record.photos.length === 0) return null;
  return record.photos[0] || null;
}

export { RADIUS_MI, EVENT_TYPES, ALLOWED_TYPES, HIDDEN_STATUSES };