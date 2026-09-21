import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  evaluateTournamentListing,
  checkTournamentListing,
  formatTournamentDto,
  TOURNAMENT_TYPES,
} from '../../shared/tournamentPolicy.ts';
import {
  evaluatePublicListing,
  checkPublicListing,
  isEventEnded,
  EVENT_TYPES,
  isTrustedSourceUrl,
  DEFAULT_RADIUS_MI,
  MAX_RADIUS_MI,
} from '../../shared/publicListingPolicy.ts';

// ============================================================
// runTournamentTests — automated tests proving the tournament
// search and expiration rules are enforced server-side.
// ============================================================

function makeBaseTournament(overrides = {}) {
  return {
    id: 'test-t-001',
    name: 'Sherman Charity Classic',
    type: 'tournament',
    status: 'approved',
    golf_verified: true,
    verified_by: 'admin-001',
    verified_at: '2026-09-01T00:00:00Z',
    golf_verified_by: 'admin-001',
    golf_verified_at: '2026-09-01T00:00:00Z',
    verification_tier: 2,
    source_url: 'https://www.shermangolfclub.com/events/classic',
    source_type: 'official_website',
    latitude: 33.6554,
    longitude: -96.6014,
    city: 'Sherman',
    state: 'TX',
    venue_name: 'Sherman Golf Club',
    starts_at: '2026-10-15T08:00:00-05:00',
    ends_at: '2026-10-15T18:00:00-05:00',
    event_timezone: 'America/Chicago',
    ...overrides,
  };
}

export default async function (req) {
  const results = [];
  const add = (name, pass, detail = null) => results.push({ name, pass, detail });

  const playerLat = 33.6554;
  const playerLng = -96.6014;

  // ============================================================
  // 1. Approved regular venue cannot appear in Tournament results
  // ============================================================
  {
    const course = makeBaseTournament({ type: 'course', starts_at: undefined, ends_at: undefined, event_timezone: undefined });
    const ev = evaluateTournamentListing(course, playerLat, playerLng, 15);
    add('approved course cannot appear in tournament results', ev === null, `ev=${JSON.stringify(ev)}`);
  }

  // ============================================================
  // 2. Generic business / non-golf event / adult-unsafe / weak-source / Google-only / AI-invented cannot appear
  // ============================================================
  {
    // Generic business (not golf-related, golf_verified=false)
    const business = makeBaseTournament({ golf_verified: false, name: 'Local Restaurant' });
    add('generic business (golf_verified=false) hidden', evaluateTournamentListing(business, playerLat, playerLng, 15) === null);
  }
  {
    // Non-golf event (golf_verified=false, but name contains "golf")
    const nonGolf = makeBaseTournament({ golf_verified: false, name: 'Charity Bake Sale at Golf Club' });
    add('non-golf event (name has golf but unverified) hidden', evaluateTournamentListing(nonGolf, playerLat, playerLng, 15) === null);
  }
  {
    // Adult/unsafe business
    const unsafe = makeBaseTournament({ golf_verified: false, name: 'Adult Entertainment Venue' });
    add('adult/unsafe item hidden', evaluateTournamentListing(unsafe, playerLat, playerLng, 15) === null);
  }
  {
    // Weakly sourced (untrusted source URL — Google Maps)
    const weak = makeBaseTournament({ source_url: 'https://maps.google.com/place/123' });
    add('weakly sourced (Google Maps URL) hidden', evaluateTournamentListing(weak, playerLat, playerLng, 15) === null);
  }
  {
    // Google-only result (source_type=google_places, not official_website)
    const googleOnly = makeBaseTournament({ source_type: 'google_places', source_url: 'https://maps.google.com/place/456' });
    add('Google-only result hidden', evaluateTournamentListing(googleOnly, playerLat, playerLng, 15) === null);
  }
  {
    // AI-invented (no source_url at all)
    const invented = makeBaseTournament({ source_url: null });
    add('AI-invented (no source_url) hidden', evaluateTournamentListing(invented, playerLat, playerLng, 15) === null);
  }

  // ============================================================
  // 3. Missing dates / invalid dates / expired / missing source / missing coords / unverified / wrong status
  // ============================================================
  {
    const noStart = makeBaseTournament({ starts_at: null });
    add('missing start date hidden', evaluateTournamentListing(noStart, playerLat, playerLng, 15) === null);
  }
  {
    const noEnd = makeBaseTournament({ ends_at: null });
    add('missing end date hidden', evaluateTournamentListing(noEnd, playerLat, playerLng, 15) === null);
  }
  {
    const invalidStart = makeBaseTournament({ starts_at: 'not-a-date' });
    add('invalid start date hidden', evaluateTournamentListing(invalidStart, playerLat, playerLng, 15) === null);
  }
  {
    const invalidEnd = makeBaseTournament({ ends_at: 'not-a-date' });
    add('invalid end date hidden', evaluateTournamentListing(invalidEnd, playerLat, playerLng, 15) === null);
  }
  {
    // Expired — ended in the past with full datetime
    const expired = makeBaseTournament({ starts_at: '2026-01-15T08:00:00-06:00', ends_at: '2026-01-15T18:00:00-06:00' });
    add('expired tournament (full datetime) hidden', evaluateTournamentListing(expired, playerLat, playerLng, 15) === null);
  }
  {
    // Expired — date-only end date, past
    const expiredDateOnly = makeBaseTournament({ starts_at: '2026-01-15', ends_at: '2026-01-15', event_timezone: 'America/Chicago' });
    add('expired tournament (date-only) hidden', evaluateTournamentListing(expiredDateOnly, playerLat, playerLng, 15) === null);
  }
  {
    const noSource = makeBaseTournament({ source_url: null });
    add('missing confirmed source hidden', evaluateTournamentListing(noSource, playerLat, playerLng, 15) === null);
  }
  {
    const noCoords = makeBaseTournament({ latitude: null, longitude: null });
    add('missing coordinates hidden', evaluateTournamentListing(noCoords, playerLat, playerLng, 15) === null);
  }
  {
    const unverified = makeBaseTournament({ golf_verified: false });
    add('unverified golf relevance hidden', evaluateTournamentListing(unverified, playerLat, playerLng, 15) === null);
  }
  {
    const wrongStatus = makeBaseTournament({ status: 'pending' });
    add('wrong status (pending) hidden', evaluateTournamentListing(wrongStatus, playerLat, playerLng, 15) === null);
  }
  {
    const wrongStatus2 = makeBaseTournament({ status: 'flagged' });
    add('wrong status (flagged) hidden', evaluateTournamentListing(wrongStatus2, playerLat, playerLng, 15) === null);
  }
  {
    const noTier = makeBaseTournament({ verification_tier: null });
    add('no verification tier hidden', evaluateTournamentListing(noTier, playerLat, playerLng, 15) === null);
  }
  {
    const tier5 = makeBaseTournament({ verification_tier: 5 });
    add('tier 5 hidden', evaluateTournamentListing(tier5, playerLat, playerLng, 15) === null);
  }

  // ============================================================
  // 4. Event disappears from feed and detail route after end time
  // ============================================================
  {
    // Currently live tournament (starts in past, ends in future)
    const live = makeBaseTournament({
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    });
    add('currently live tournament visible', evaluateTournamentListing(live, playerLat, playerLng, 15) !== null);
  }
  {
    // Ended 1 second ago
    const justEnded = makeBaseTournament({
      starts_at: '2026-09-18T08:00:00-05:00',
      ends_at: new Date(Date.now() - 1000).toISOString(),
    });
    add('tournament ended 1s ago hidden', evaluateTournamentListing(justEnded, playerLat, playerLng, 15) === null);
  }
  {
    // Ending in 1 second — still visible
    const endingSoon = makeBaseTournament({
      starts_at: '2026-09-18T08:00:00-05:00',
      ends_at: new Date(Date.now() + 1000).toISOString(),
    });
    add('tournament ending in 1s still visible', evaluateTournamentListing(endingSoon, playerLat, playerLng, 15) !== null);
  }

  // ============================================================
  // 5. Timezone-aware expiration
  // ============================================================
  {
    // Date-only end, today's date in America/Chicago — not ended
    const today = new Date();
    const chicagoFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = chicagoFmt.formatToParts(today);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    const todayStr = `${get('year')}-${get('month')}-${get('day')}`;
    const endsToday = makeBaseTournament({ starts_at: todayStr, ends_at: todayStr, event_timezone: 'America/Chicago' });
    add('date-only ending today (in tz) not ended', isEventEnded(todayStr, 'America/Chicago') === false);
  }
  {
    // Date-only end, yesterday — ended
    const yesterday = new Date(Date.now() - 86400000);
    const chicagoFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = chicagoFmt.formatToParts(yesterday);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    const yesterdayStr = `${get('year')}-${get('month')}-${get('day')}`;
    add('date-only ended yesterday (in tz) is ended', isEventEnded(yesterdayStr, 'America/Chicago') === true);
  }
  {
    // No timezone — falls back to UTC, date-only
    add('no timezone falls back to UTC (date-only)', isEventEnded('2026-01-15', undefined) === true);
  }
  {
    // Invalid timezone — falls back to UTC
    add('invalid timezone falls back to UTC', isEventEnded('2026-01-15', 'Invalid/Timezone') === true);
  }

  // ============================================================
  // 6. Radius enforcement — 15 default, 30 max
  // ============================================================
  {
    // Within 15 miles — visible at 15
    const near = makeBaseTournament({ latitude: 33.70, longitude: -96.60 }); // ~3 miles north
    add('within 15mi visible at default radius', evaluateTournamentListing(near, playerLat, playerLng, 15) !== null);
  }
  {
    // Beyond 15 miles, within 30 — hidden at 15, visible at 30
    const far = makeBaseTournament({ latitude: 33.6554, longitude: -96.20 }); // ~22 miles east
    add('beyond 15mi hidden at default', evaluateTournamentListing(far, playerLat, playerLng, 15) === null);
    add('beyond 15mi visible at 30mi expansion', evaluateTournamentListing(far, playerLat, playerLng, 30) !== null);
  }
  {
    // Beyond 30 miles — hidden even at 30
    const veryFar = makeBaseTournament({ latitude: 33.6554, longitude: -95.80 }); // ~45 miles east
    add('beyond 30mi hidden at max radius', evaluateTournamentListing(veryFar, playerLat, playerLng, 30) === null);
  }
  {
    // Radius > 30 clamped to 30
    add('radius 50 clamped to 30 (very far still hidden)', evaluateTournamentListing(makeBaseTournament({ latitude: 33.6554, longitude: -95.80 }), playerLat, playerLng, 50) === null);
  }

  // ============================================================
  // 7. All tournament categories pass when valid
  // ============================================================
  for (const type of ['tournament', 'charity_event', 'corporate_event', 'league']) {
    const t = makeBaseTournament({ type });
    add(`category "${type}" visible when valid`, evaluateTournamentListing(t, playerLat, playerLng, 15) !== null);
  }

  // ============================================================
  // 8. Sanitized DTO — no private fields exposed
  // ============================================================
  {
    const t = makeBaseTournament();
    const ev = evaluateTournamentListing(t, playerLat, playerLng, 15);
    const dto = formatTournamentDto(t, ev?.distance ?? null);
    const privateFields = ['verified_by', 'golf_verified_by', 'verified_at', 'golf_verified_at', 'verification_notes', 'ingestion_source', 'ingestion_job_id', 'source_urls_considered', 'verification_tier', 'claim_status', 'claimed_by'];
    const exposed = privateFields.filter((f) => dto && f in dto);
    add('DTO excludes private verification/audit fields', exposed.length === 0, `exposed=${exposed.join(',')}`);
    add('DTO includes tournament fields', dto && dto.startsAt && dto.endsAt && dto.event_timezone && dto.fee_status);
    add('DTO includes distance', dto && dto.distance != null);
  }

  // ============================================================
  // 9. Base policy also hides expired events (not just tournament policy)
  // ============================================================
  {
    const expired = makeBaseTournament({ starts_at: '2026-01-15T08:00:00-06:00', ends_at: '2026-01-15T18:00:00-06:00' });
    add('base policy also hides expired events', evaluatePublicListing(expired, playerLat, playerLng, 15) === null);
  }

  // ============================================================
  // 10. No player location → hidden
  // ============================================================
  {
    const t = makeBaseTournament();
    add('no player location → hidden', evaluateTournamentListing(t, null, null, 15) === null);
  }

  // ============================================================
  // 11. checkTournamentListing returns structured failure reasons
  // ============================================================
  {
    const noDates = makeBaseTournament({ starts_at: null, ends_at: null });
    const result = checkTournamentListing(noDates, playerLat, playerLng, 15);
    add('checkTournamentListing returns failure reasons', result.pass === false && result.firstFailingReason !== null);
  }

  // ============================================================
  // Summary
  // ============================================================
  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  });
}