// ============================================================
// Public Listing Policy — the single authoritative trust gate.
// SERVER-ONLY. Every player-facing listing endpoint MUST use this
// predicate. No frontend component may decide eligibility.
// No endpoint may return a broader raw collection and rely on the
// browser to filter it.
// ============================================================

const RADIUS_MI = 15;
export const DEFAULT_RADIUS_MI = 15;
export const MAX_RADIUS_MI = 30;

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
    return !UNTRUSTED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ============================================================
// Event expiration — timezone-aware.
//
// The server-side policy must exclude an event the instant its
// verified end time has passed in the event's local timezone.
// If only an end date is available, treat the event as ended at
// the end of that local calendar day. Do not guess an earlier or
// later time.
// ============================================================

// Get the current date and time components in a specific IANA timezone.
function nowInTimezone(tz: string): { dateStr: string } {
  const now = new Date();
  if (!tz || tz === 'UTC') {
    return { dateStr: now.toISOString().slice(0, 10) };
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return { dateStr: `${get('year')}-${get('month')}-${get('day')}` };
  } catch {
    // Invalid timezone — fall back to UTC
    return { dateStr: now.toISOString().slice(0, 10) };
  }
}

// Check if an event has ended, accounting for timezone.
// - If endsAt has time/timezone info, compare directly (Date handles offset).
// - If endsAt is date-only, treat as ended at end of that calendar day in eventTimezone.
// - If endsAt is missing, return true (no end = ended, for safety).
export function isEventEnded(endsAt: string, eventTimezone?: string): boolean {
  if (!endsAt) return true;

  const str = String(endsAt);
  const now = new Date();

  // Check if the string has time information (T separator, Z suffix, or timezone offset)
  const hasTimeInfo = str.includes('T') || str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str);

  if (hasTimeInfo) {
    // Full datetime — Date constructor handles the timezone offset
    const endDate = new Date(str);
    if (isNaN(endDate.getTime())) return true;
    return now.getTime() > endDate.getTime();
  }

  // Date-only — treat as ended at end of that calendar day in eventTimezone.
  // "End of day" means: if today's date in the event's timezone is past the
  // event's end date, the event has ended. If it's the same date, the event
  // has not yet ended (it ends at 23:59:59 that day).
  const dateStr = str.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return true;

  const tz = eventTimezone || 'UTC';
  const nowInTz = nowInTimezone(tz);

  // If today's date in tz is after the event date, it's ended.
  // If same date or before, it's not ended (end of day).
  return nowInTz.dateStr > dateStr;
}

// Core, detailed evaluation. Returns a structured result with a
// pass/fail for every required policy condition and the first
// failing reason. Used by the audit diagnostic; the simple
// evaluatePublicListing predicate below derives from this so there
// is exactly ONE trust gate.
export function checkPublicListing(record, playerLat, playerLng, radiusMi) {
  const checks = [];
  const add = (rule, pass, reason) =>
    checks.push({ rule, pass: !!pass, reason: pass ? null : reason });
  const effectiveRadius = Math.min(Math.max(radiusMi || RADIUS_MI, 1), MAX_RADIUS_MI);

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
  // 5b. verification provenance — a COMPLETE verification record, not just
  //     a name. Import provenance (ingestion_source, ingestion_job_id,
  //     source_urls_considered) describes where an imported record came
  //     from; it does NOT make a listing player-visible and does NOT count
  //     as verification proof. Public eligibility requires separate
  //     verification provenance created only after the full automated
  //     verification contract succeeds (or a complete legacy/manual
  //     verification record with a confirmed source and audit timestamp).
  //
  //     Required verification fields:
  //       - verified_by or golf_verified_by (verifier identity)
  //       - verified_at or golf_verified_at (verification timestamp)
  //       - source_url (valid, confirmed official source)
  //     golf_verified_by alone is NOT enough unless accompanied by a
  //     timestamp and a valid source URL. A record with only
  //     ingestion_source — even if every other listing field is
  //     populated — must remain hidden.
  const hasVerifier = !!(record.verified_by || record.golf_verified_by);
  const hasTimestamp = !!(record.verified_at || record.golf_verified_at);
  const hasValidSource = isTrustedSourceUrl(record.source_url);
  add('verification_provenance', hasVerifier && hasTimestamp && hasValidSource, 'incomplete verification provenance: requires verifier + timestamp + valid source_url');
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
    add('within_radius', distance <= effectiveRadius, `distance=${distance}mi > ${effectiveRadius}mi`);
  } else {
    add('within_15mi', false, 'cannot compute distance (missing coordinates)');
  }

  // 10. ended events excluded — timezone-aware expiration
  const isEvent = EVENT_TYPES.has(record.type);
  const ended = isEvent && isEventEnded(record.ends_at, record.event_timezone);
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
export function evaluatePublicListing(record, playerLat, playerLng, radiusMi) {
  const result = checkPublicListing(record, playerLat, playerLng, radiusMi);
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

export { RADIUS_MI, EVENT_TYPES, ALLOWED_TYPES, HIDDEN_STATUSES, isTrustedSourceUrl, isValidUrl };