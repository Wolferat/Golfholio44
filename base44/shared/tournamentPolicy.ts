// ============================================================
// Tournament Policy — extends the Public Listing Policy with
// tournament-specific rules.
//
// A tournament may appear to a player only when EVERY ordinary
// listing-policy rule passes AND all tournament rules below pass
// on the server:
//
//   - category is tournament, charity_event, corporate_event, or league
//   - event start date and end date are present and valid
//   - event has not ended (timezone-aware)
//   - event has a real title, venue/location, and source-backed schedule
//
// No fallback result, client-side query, name keyword, generic website,
// cached data, local storage, mock data, Google snippet, or direct
// database read may override a failed rule.
//
// Returns only a sanitized public tournament DTO. Players must never
// receive raw listing rows or private verification/audit fields.
// ============================================================

import {
  checkPublicListing,
  evaluatePublicListing,
  publicPhoto,
  EVENT_TYPES,
  isTrustedSourceUrl,
  isEventEnded,
} from './publicListingPolicy.ts';

// Tournament-specific categories
export const TOURNAMENT_TYPES = EVENT_TYPES;

// Check if a listing is a tournament-type event
export function isTournamentType(record): boolean {
  return !!record && EVENT_TYPES.has(record.type);
}

// Detailed tournament evaluation. Extends checkPublicListing with
// tournament-specific checks.
export function checkTournamentListing(record, playerLat, playerLng, radiusMi) {
  // First run the base listing policy
  const baseResult = checkPublicListing(record, playerLat, playerLng, radiusMi);
  const checks = [...baseResult.checks];

  // Tournament-specific checks (only meaningful if the record exists)
  if (!record) {
    return baseResult;
  }

  // T1. category is tournament, charity_event, corporate_event, or league
  const isTournamentCategory = EVENT_TYPES.has(record.type);
  checks.push({
    rule: 'tournament_category',
    pass: isTournamentCategory,
    reason: isTournamentCategory ? null : `type=${record.type} is not a tournament category`,
  });

  // T2. start date is present and valid
  const hasValidStart = !!(record.starts_at && !isNaN(new Date(record.starts_at).getTime()));
  checks.push({
    rule: 'has_valid_start',
    pass: hasValidStart,
    reason: hasValidStart ? null : 'missing or invalid start date',
  });

  // T3. end date is present and valid
  const hasValidEnd = !!(record.ends_at && !isNaN(new Date(record.ends_at).getTime()));
  checks.push({
    rule: 'has_valid_end',
    pass: hasValidEnd,
    reason: hasValidEnd ? null : 'missing or invalid end date',
  });

  // T4. event has not ended — timezone-aware
  const ended = hasValidEnd && isEventEnded(record.ends_at, record.event_timezone);
  checks.push({
    rule: 'tournament_not_ended',
    pass: !ended,
    reason: ended ? 'tournament has ended' : null,
  });

  // T5. event has a real title (name is non-empty)
  const hasTitle = !!(record.name && record.name.trim().length > 0);
  checks.push({
    rule: 'has_title',
    pass: hasTitle,
    reason: hasTitle ? null : 'missing event title',
  });

  // T6. event has a venue/location (venue_name, city, or address)
  const hasLocation = !!(record.venue_name || record.city || record.address);
  checks.push({
    rule: 'has_location',
    pass: hasLocation,
    reason: hasLocation ? null : 'missing venue/location',
  });

  // T7. source-backed schedule (source_url is valid — already checked by base
  // policy, but we re-assert here for the tournament contract)
  const hasSourceSchedule = isTrustedSourceUrl(record.source_url);
  checks.push({
    rule: 'source_backed_schedule',
    pass: hasSourceSchedule,
    reason: hasSourceSchedule ? null : 'missing or untrusted source URL',
  });

  // Combine: pass only if ALL checks pass (base + tournament)
  const firstFailing = checks.find((c) => !c.pass);
  return {
    pass: !firstFailing,
    distance: firstFailing ? null : baseResult.distance,
    firstFailingReason: firstFailing ? firstFailing.reason : null,
    checks,
  };
}

// Returns { distance } when the tournament is eligible, or null.
// Fail closed: any uncertainty → null.
export function evaluateTournamentListing(record, playerLat, playerLng, radiusMi) {
  const result = checkTournamentListing(record, playerLat, playerLng, radiusMi);
  return result.pass ? { distance: result.distance } : null;
}

// ============================================================
// Sanitized Tournament DTO — only player-safe fields.
// Never exposes raw listing rows or private verification/audit fields.
// ============================================================
export function formatTournamentDto(record, distance: number | null) {
  if (!record) return null;

  const startsAt = record.starts_at || null;
  const endsAt = record.ends_at || null;
  const now = new Date();

  // Live = currently between start and end
  const isLive =
    startsAt &&
    new Date(startsAt) <= now &&
    (!endsAt || new Date(endsAt) >= now);

  // Fee display logic: never infer or invent pricing
  const feeStatus = record.fee_status || 'unknown';
  const individualFee = typeof record.individual_entry_fee === 'number' ? record.individual_entry_fee : null;
  const teamFee = typeof record.team_entry_fee === 'number' ? record.team_entry_fee : null;
  const currency = record.currency || 'USD';

  return {
    id: record.id,
    type: record.type,
    name: record.name,
    // Host venue
    venue: record.venue_name || null,
    // Location
    city: record.city || null,
    state: record.state || null,
    address: record.address || null,
    location: [record.venue_name, record.city].filter(Boolean).join(' · ') || null,
    // Schedule
    startsAt,
    endsAt,
    event_timezone: record.event_timezone || null,
    date: startsAt ? String(startsAt).slice(0, 10) : null,
    live: !!isLive,
    registration_deadline: record.registration_deadline || null,
    // Official URLs
    website: record.official_website || record.website || null,
    official_registration_url: record.official_registration_url || null,
    // Fees — only when stated by the source
    individual_entry_fee: individualFee,
    team_entry_fee: teamFee,
    currency,
    fee_status: feeStatus,
    // Event details — only when stated by the source
    event_format: record.event_format || null,
    team_size: typeof record.team_size === 'number' ? record.team_size : null,
    eligibility: record.eligibility || null,
    included_items: record.included_items || null,
    // Contact — only if published by the official organizer
    phone: record.phone || null,
    contact_email: record.contact_email || null,
    // Verification timestamp
    last_source_verification: record.last_source_verification || record.verified_at || record.golf_verified_at || null,
    // Display
    photo: publicPhoto(record),
    rating: record.rating ?? null,
    distance,
    is_professional_tournament: record.is_professional_tournament || false,
    // Coordinates for directions
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
  };
}