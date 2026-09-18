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

// Rule 7: source_url must be a valid http/https URL. No other scheme
// (ftp, data, javascript, file, ...) may satisfy this rule.
function isValidUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// A trusted source URL must be http/https AND must NOT be a generic
// Google Maps, directory, social, or aggregator URL. Only an official
// venue/event site or approved authoritative source qualifies.
const UNTRUSTED_HOSTS = [
  'maps.google.com', 'google.com/maps', 'goo.gl', 'google.com/local',
  'yelp.com', 'tripadvisor.com', 'facebook.com', 'fb.com', 'm.facebook.com',
  'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'wikipedia.org', 'foursquare.com', 'yellowpages.com',
  'mapquest.com', 'bing.com/maps', 'apple.com/maps', 'superpages.com',
  'business.google.com', 'plus.google.com',
];

function isTrustedSourceUrl(u) {
  if (!isValidUrl(u)) return false;
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    return !UNTRUSTED_HOSTS.some((b) => host === b || host.endsWith('.' + b) || host.includes(b));
  } catch {
    return false;
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Core, detailed evaluation. Returns a structured result with a
// pass/fail for every required policy condition and the first
// failing reason. Used by the audit diagnostic; the simple
// evaluatePublicListing predicate below derives from this so there
// is exactly ONE trust gate.
export function checkPublicListing(record, playerLat, playerLng) {
  const checks = [];
  const add = (rule, pass, reason) =>
    checks.push({ rule, pass: !!pass, reason: pass ? null : reason });

  if (!record) {
    return {
      pass: false,
      distance: null,
      firstFailingReason: 'no record',
      checks: [{ rule: 'exists', pass: false, reason: 'no record' }],
    };
  }

  // 4. status === "approved"
  add('status_approved', record.status === 'approved', `status=${record.status}`);
  // 5. golf_verified === true
  add('golf_verified', record.golf_verified === true, 'golf_verified is not true');
  // 6. verification_tier is exactly 1, 2, 3, or 4
  const tier = record.verification_tier;
  add(
    'verification_tier',
    tier === 1 || tier === 2 || tier === 3 || tier === 4,
    `verification_tier=${tier}`
  );
  // 7. source_url is a valid https/http URL
  add('source_url_valid', isTrustedSourceUrl(record.source_url), 'source_url missing, not http/https, or untrusted (Google Maps/directory/social)');
  // 8. type is one of the allowed values
  add('type_allowed', ALLOWED_TYPES.has(record.type), `type=${record.type}`);
  // 9. valid numeric latitude and longitude
  add(
    'coords_valid',
    isNumber(record.latitude) && isNumber(record.longitude),
    'missing numeric latitude/longitude'
  );
  // 2. player must provide GPS or ZIP-derived coordinates
  add('player_location', isNumber(playerLat) && isNumber(playerLng), 'missing player coordinates');

  // 3. server-calculated distance within 15 miles
  let distance = null;
  if (
    isNumber(record.latitude) &&
    isNumber(record.longitude) &&
    isNumber(playerLat) &&
    isNumber(playerLng)
  ) {
    distance = Math.round(haversineMi(playerLat, playerLng, record.latitude, record.longitude) * 10) / 10;
    add('within_15mi', distance <= RADIUS_MI, `distance=${distance}mi > ${RADIUS_MI}mi`);
  } else {
    add('within_15mi', false, 'cannot compute distance (missing coordinates)');
  }

  // 10. ended events excluded
  const ended = EVENT_TYPES.has(record.type) && record.ends_at && new Date(record.ends_at) < new Date();
  add('not_ended', !ended, ended ? 'event has ended' : null);

  const firstFailing = checks.find((c) => !c.pass);
  return {
    pass: !firstFailing,
    distance: firstFailing ? null : distance,
    firstFailingReason: firstFailing ? firstFailing.reason : null,
    checks,
  };
}

// Returns { distance } when the record is eligible to be shown to a player,
// or null when it must NOT be shown. Fail closed: any uncertainty → null.
export function evaluatePublicListing(record, playerLat, playerLng) {
  const result = checkPublicListing(record, playerLat, playerLng);
  return result.pass ? { distance: result.distance } : null;
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