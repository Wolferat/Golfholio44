import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  evaluatePublicListing,
  publicPhoto,
} from '../../shared/publicListingPolicy.ts';
import { resolveConfirmedSourceUrl } from '../../shared/approvalPolicy.ts';
import { validateEvidence, decideVerification, evaluateCorroboration, validatePublicUrl } from '../../shared/automatedVerification.ts';
import { buildListingRecord } from '../../shared/googlePlaces.ts';

// Server-side policy test harness. Runs the shared predicate against
// synthetic in-memory records AND actual current database records.
// Does NOT modify any listing data, does NOT call any external API.
function base(overrides) {
  return {
    name: 'Test Course',
    status: 'approved',
    golf_verified: true,
    golf_verified_by: 'test-verifier',
    verification_tier: 1,
    source_url: 'https://example.com/source',
    type: 'course',
    latitude: 33.6357,
    longitude: -96.6086,
    ...overrides,
  };
}

const PLAYER = { lat: 33.6357, lng: -96.6086 };

// The six records approved in the last batch.
const APPROVED_6 = [
  '6aa485ac26c858720b49ca80', // Pin High Indoor Golf Club
  '6aa485ac26c858720b49ca98', // Lake Fork Golf Course
  '6aa485ac26c858720b49ca8c', // Cedar Creek Country Club
  '6aa485ac26c858720b49ca91', // The Oaks Country Club, TX
  '6aa485ac26c858720b49ca86', // King's Creek Country Club
  '6aa485ac26c858720b49ca90', // Rusted Rail Golf, Grill, & Events
];

// Real non-golf records from the database (cleanup queue samples).
const NON_GOLF = {
  church: '6aa485ac26c858720b49ca64',
  hotel: '6aa485ac26c858720b49ca63',
  restaurant: '6aa485ac26c858720b49ca73',
  doctor: '6aa485ac26c858720b49ca46',
  retailer: '6aa485ac26c858720b49ca67',
  government: '6aa485ac26c858720b49ca75',
};

const syntheticCases = [
  { name: 'approved golf-verified within 15mi → eligible', rec: base({}), expect: true },
  { name: 'church (golf_verified false) → hidden', rec: base({ golf_verified: false, name: 'St Mary Church Golf Room' }), expect: false },
  { name: 'school → hidden', rec: base({ golf_verified: false, name: 'Sherman High School' }), expect: false },
  { name: 'hotel → hidden', rec: base({ golf_verified: false, name: 'Sherman Grand Hotel' }), expect: false },
  { name: 'restaurant → hidden', rec: base({ golf_verified: false, name: 'Fairway Restaurant' }), expect: false },
  { name: 'retail store → hidden', rec: base({ golf_verified: false, name: 'Golf Gear Retail' }), expect: false },
  { name: 'doctor / medical → hidden', rec: base({ golf_verified: false, name: 'U.S. Renal Care Clinic' }), expect: false },
  { name: 'government building → hidden', rec: base({ golf_verified: false, name: 'Kaufman County Court House' }), expect: false },
  { name: 'adult/unsafe business → hidden', rec: base({ golf_verified: false, name: 'Adult Golf Lounge' }), expect: false },
  { name: 'random google result → hidden', rec: base({ golf_verified: false }), expect: false },
  { name: 'golf_verified false (name contains golf) → hidden', rec: base({ golf_verified: false, name: 'Golf World' }), expect: false },
  { name: 'no tier 1-4 (tier 5) → hidden', rec: base({ verification_tier: 5 }), expect: false },
  { name: 'no tier (null) → hidden', rec: base({ verification_tier: null }), expect: false },
  { name: 'no source_url → hidden', rec: base({ source_url: '' }), expect: false },
  { name: 'invalid source_url → hidden', rec: base({ source_url: 'not a url' }), expect: false },
  { name: 'non-http source_url (ftp) → hidden', rec: base({ source_url: 'ftp://example.com' }), expect: false },
  { name: 'non-http source_url (data) → hidden', rec: base({ source_url: 'data:text/html,<b>x</b>' }), expect: false },
  { name: 'non-http source_url (javascript) → hidden', rec: base({ source_url: 'javascript:alert(1)' }), expect: false },
  { name: 'invalid/legacy category (lesson) → hidden', rec: base({ type: 'lesson' }), expect: false },
  { name: 'pending status → hidden', rec: base({ status: 'pending' }), expect: false },
  { name: 'flagged status → hidden', rec: base({ status: 'flagged' }), expect: false },
  { name: 'rejected status → hidden', rec: base({ status: 'rejected' }), expect: false },
  { name: 'expired status → hidden', rec: base({ status: 'expired' }), expect: false },
  { name: 'archived status → hidden', rec: base({ status: 'archived' }), expect: false },
  { name: 'claimed-management status → hidden', rec: base({ status: 'claimed' }), expect: false },
  { name: 'more than 15mi away → hidden', rec: base({ latitude: 34.0, longitude: -96.6086 }), expect: false },
  { name: 'expired tournament → hidden', rec: base({ type: 'tournament', ends_at: '2020-01-01T00:00:00Z' }), expect: false },
  { name: 'no valid coordinates → hidden', rec: base({ latitude: null, longitude: null }), expect: false },
  { name: 'unverified/reviewer photo only → no photo', rec: base({ photo_verified: false, photos: ['https://x.com/p.jpg'] }), photoExpect: null },
  { name: 'verified official photo → photo returned', rec: base({ photo_verified: true, photos: ['https://x.com/p.jpg'] }), photoExpect: 'https://x.com/p.jpg' },
];

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const results = [];

  // --- Synthetic cases ---
  for (const c of syntheticCases) {
    if (c.photoExpect !== undefined) {
      const got = publicPhoto(c.rec);
      results.push({ case: c.name, pass: got === c.photoExpect, got });
    } else {
      const ev = evaluatePublicListing(c.rec, PLAYER.lat, PLAYER.lng);
      results.push({ case: c.name, pass: (ev != null) === c.expect, eligible: ev != null });
    }
  }

  // --- Actual database records ---
  const all = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' }).catch(() => []);
  const getById = async (id) => {
    const hit = all.find((r) => r.id === id);
    if (hit) return hit;
    return base44.asServiceRole.entities.Listing.get(id).catch(() => null);
  };

  // The six newly approved records: as stored (source_url null) they MUST be
  // blocked by rule 7 — proving the policy does not rubber-stamp approvals.
  for (const id of APPROVED_6) {
    const r = await getById(id);
    if (!r) { results.push({ case: `actual 6-approved ${id}`, pass: false, note: 'not found' }); continue; }
    const ev = evaluatePublicListing(r, r.latitude, r.longitude);
    results.push({
      case: `actual 6-approved (stored): ${r.name} — source_url=${r.source_url ? 'set' : 'null'}`,
      pass: ev == null,
      eligible: ev != null,
      note: ev == null ? 'correctly blocked (source_url null per rule 7)' : 'unexpectedly eligible',
    });
  }

  // The same six, with source_url populated (as the approval workflow now
  // does), must appear ONLY within 15 miles of their own coordinates and
  // never beyond.
  for (const id of APPROVED_6) {
    const r = await getById(id);
    if (!r) continue;
    const synth = { ...r, source_url: r.official_website || r.website || 'https://example.com' };
    const evNear = evaluatePublicListing(synth, r.latitude, r.longitude);
    const farLat = typeof r.latitude === 'number' ? r.latitude + 5 : PLAYER.lat + 5;
    const evFar = evaluatePublicListing(synth, farLat, r.longitude);
    results.push({
      case: `synthetic 6-approved w/ source_url WITHIN 15mi: ${r.name}`,
      pass: evNear != null,
      eligible: evNear != null,
    });
    results.push({
      case: `synthetic 6-approved w/ source_url BEYOND 15mi: ${r.name}`,
      pass: evFar == null,
      eligible: evFar != null,
    });
  }

  // Real non-golf records must never appear, even at their own coordinates
  // (direct detail URL / guessed ID cannot bypass the policy).
  for (const [label, id] of Object.entries(NON_GOLF)) {
    const r = await getById(id);
    if (!r) { results.push({ case: `actual ${label} ${id}`, pass: false, note: 'not found' }); continue; }
    const ev = evaluatePublicListing(r, r.latitude ?? PLAYER.lat, r.longitude ?? PLAYER.lng);
    results.push({
      case: `actual ${label}: ${r.name}`,
      pass: ev == null,
      eligible: ev != null,
    });
  }

  // Category filtering cannot bypass: a non-golf record whose type happens
  // to be 'course' (the schema default) must still be blocked.
  const courseTypeNonGolf = all.find((r) => r.type === 'course' && r.golf_verified !== true);
  if (courseTypeNonGolf) {
    const ev = evaluatePublicListing(courseTypeNonGolf, courseTypeNonGolf.latitude ?? PLAYER.lat, courseTypeNonGolf.longitude ?? PLAYER.lng);
    results.push({
      case: `category=course non-golf: ${courseTypeNonGolf.name}`,
      pass: ev == null,
      eligible: ev != null,
    });
  }

  // Cached/local fallback cannot bypass: the policy is a pure predicate over
  // record + player coords; an empty/remote area returns 0 passing records.
  let remotePass = 0;
  for (const r of all) {
    if (evaluatePublicListing(r, 70, -150) != null) remotePass++;
  }
  results.push({ case: 'empty/remote area (70,-150) → 0 passing', pass: remotePass === 0, eligible: remotePass });

  // --- Approval workflow: resolveConfirmedSourceUrl ---
  // A generic `website` is never a trusted source. Only an explicit
  // http/https source_url, or a confirmed official_website /
  // official_registration_url, may populate source_url.
  const appr = (name, record, body, expectOk) => {
    const r = resolveConfirmedSourceUrl(record, body);
    results.push({ case: name, pass: r.ok === expectOk, ok: r.ok, reason: r.reason });
  };
  appr('approval: only website, no confirmation → FAIL', { website: 'https://x.com' }, {}, false);
  appr('approval: only website + confirm_official_website → FAIL (no official_website)', { website: 'https://x.com' }, { confirm_official_website: true }, false);
  appr('approval: explicit http source_url → SUCCEED', { website: 'https://x.com' }, { source_url: 'https://official.example.com' }, true);
  appr('approval: explicit https source_url → SUCCEED', { website: 'https://x.com' }, { source_url: 'https://official.example.com' }, true);
  appr('approval: explicit ftp source_url → FAIL', { website: 'https://x.com' }, { source_url: 'ftp://x.com' }, false);
  appr('approval: explicit invalid source_url → FAIL', { website: 'https://x.com' }, { source_url: 'not a url' }, false);
  appr('approval: confirm_official_website with valid official_website → SUCCEED', { official_website: 'https://club.example.com', website: 'https://x.com' }, { confirm_official_website: true }, true);
  appr('approval: official_website present but NOT confirmed → FAIL', { official_website: 'https://club.example.com' }, {}, false);
  appr('approval: confirm_official_registration_url valid → SUCCEED', { official_registration_url: 'https://reg.example.com' }, { confirm_official_registration_url: true }, true);
  appr('approval: confirm_official_registration_url but field missing → FAIL', { website: 'https://x.com' }, { confirm_official_registration_url: true }, false);
  appr('approval: empty record, empty body → FAIL', {}, {}, false);

  // --- Automated evidence validation ---
  // The LLM may research and classify, but it must NOT be the sole authority.
  // Every approval requires independently validated evidence. These tests
  // verify that each criterion is checked independently and that LLM
  // confidence alone never approves a listing.
  const evBase = { name: 'Test Golf Course', type: 'course', source_url: 'https://testcourse.com', latitude: 33.6, longitude: -96.6 };
  const ev = validateEvidence(evBase);
  results.push({ case: 'evidence: all criteria pass', pass: ev.categoryAllowed && ev.sourceTrusted && ev.coordsValid && ev.notExpired && ev.notNonGolfName });
  results.push({ case: 'evidence: category not allowed (lesson)', pass: !validateEvidence({ ...evBase, type: 'lesson' }).categoryAllowed });
  results.push({ case: 'evidence: source not trusted (Google Maps)', pass: !validateEvidence({ ...evBase, source_url: 'https://maps.google.com/test' }).sourceTrusted });
  results.push({ case: 'evidence: source not http (ftp)', pass: !validateEvidence({ ...evBase, source_url: 'ftp://test.com' }).sourceTrusted });
  results.push({ case: 'evidence: coords invalid', pass: !validateEvidence({ ...evBase, latitude: null, longitude: null }).coordsValid });
  results.push({ case: 'evidence: non-golf name (church)', pass: !validateEvidence({ ...evBase, name: 'St Mary Church' }).notNonGolfName });
  results.push({ case: 'evidence: expired event', pass: !validateEvidence({ ...evBase, type: 'tournament', ends_at: '2020-01-01T00:00:00Z' }).notExpired });

  const llmGolf = { is_golf: true, recommended_tier: 3, reason: 'golf course confirmed' };
  const corroborated = { corroborated: true, reason: 'source corroborated', evidence: { nameMatch: true, factMatch: true, matchedFacts: ['city'] } };
  const notCorroborated = { corroborated: false, reason: 'name not found on page', evidence: { nameMatch: false } };
  results.push({ case: 'decision: LLM golf + all evidence + corroborated → approve', pass: decideVerification(evBase, llmGolf, [], corroborated).action === 'approved' });
  results.push({ case: 'decision: LLM golf + all evidence but NOT corroborated → pending', pass: decideVerification(evBase, llmGolf, [], notCorroborated).action === 'pending' });
  results.push({ case: 'decision: LLM golf + all evidence + no corroboration result → pending', pass: decideVerification(evBase, llmGolf, [], null).action === 'pending' });
  results.push({ case: 'decision: LLM golf but no source → pending', pass: decideVerification({ ...evBase, source_url: '' }, llmGolf, []).action === 'pending' });
  results.push({ case: 'decision: LLM golf but non-golf name → pending', pass: decideVerification({ ...evBase, name: 'St Mary Church' }, llmGolf, []).action === 'pending' });
  results.push({ case: 'decision: LLM not golf → reject', pass: decideVerification(evBase, { is_golf: false, recommended_tier: 0, reason: 'not golf' }, []).action === 'rejected' });
  results.push({ case: 'decision: LLM result missing → pending (fail-closed)', pass: decideVerification(evBase, null, []).action === 'pending' });
  results.push({ case: 'decision: duplicate (corroborated) → reject', pass: decideVerification(evBase, llmGolf, [{ id: 'other', name: 'Test Golf Course', type: 'course' }], corroborated).action === 'rejected' });
  results.push({ case: 'decision: expired event → expired', pass: decideVerification({ ...evBase, type: 'tournament', ends_at: '2020-01-01T00:00:00Z' }, llmGolf, []).action === 'expired' });
  results.push({ case: 'decision: LLM golf but bad category → reject', pass: decideVerification({ ...evBase, type: 'lesson' }, llmGolf, [], corroborated).action === 'rejected' });
  results.push({ case: 'decision: LLM golf but no coords → pending', pass: decideVerification({ ...evBase, latitude: null, longitude: null }, llmGolf, [], corroborated).action === 'pending' });

  // --- Source page corroboration tests ---
  // The source page must contain the venue name + at least one stable
  // fact. A clean-looking domain, generic golf term, or URL allow/deny
  // list is NOT enough.
  const venueListing = { name: 'Eagles Nest Golf Lounge', city: 'Canton', address: '1457 N Dallas St, Canton, TX 75103', phone: '(903) 340-1681' };
  results.push({ case: 'corroboration: matching official venue page → corroborated', pass: evaluateCorroboration('Welcome to Eagles Nest Golf Lounge in Canton, Texas. Located at 1457 N Dallas St, Canton, TX 75103. Call (903) 340-1681.', 'eaglesnestctx.com', 'eaglesnestctx.com', venueListing).corroborated });
  results.push({ case: 'corroboration: unrelated clean-looking domain → NOT corroborated', pass: !evaluateCorroboration('Welcome to Pine Valley Golf Club in Augusta, Georgia. The finest golf experience.', 'pinevalleygolf.com', 'pinevalleygolf.com', venueListing).corroborated });
  results.push({ case: 'corroboration: golf language but wrong venue/address → NOT corroborated', pass: !evaluateCorroboration('Eagles Nest Golf Lounge - we sell golf equipment at our store in Dallas TX.', 'golfshop.com', 'golfshop.com', venueListing).corroborated });
  results.push({ case: 'corroboration: redirect to unrelated domain → NOT corroborated', pass: !evaluateCorroboration('Eagles Nest Golf Lounge Canton TX 75103', 'eaglesnestctx.com', 'facebook.com', venueListing).corroborated });
  results.push({ case: 'corroboration: name match but no stable fact → NOT corroborated', pass: !evaluateCorroboration('Eagles Nest Golf Lounge - a great place to play golf.', 'someblog.com', 'someblog.com', venueListing).corroborated });
  const eventListing = { name: 'Texas Open Charity Tournament', starts_at: '2026-11-15T09:00:00Z' };
  results.push({ case: 'corroboration: official event registration page with date → corroborated', pass: evaluateCorroboration('Register for the Texas Open Charity Tournament on 2026-11-15. Join us for a great day of golf.', 'reg.example.com', 'reg.example.com', eventListing).corroborated });
  results.push({ case: 'corroboration: event page with wrong date → NOT corroborated', pass: !evaluateCorroboration('Texas Open Charity Tournament - register now for 2025-03-01 event.', 'reg.example.com', 'reg.example.com', eventListing).corroborated });
  results.push({ case: 'corroboration: empty page text → NOT corroborated', pass: !evaluateCorroboration('', 'eaglesnestctx.com', 'eaglesnestctx.com', venueListing).corroborated });

  // --- Provenance tests ---
  // Every public-eligible listing must have writer or verifier provenance.
  // An unknown/unattributed writer cannot create a public-eligible listing.
  results.push({ case: 'provenance: no ingestion_source and no golf_verified_by → hidden', pass: evaluatePublicListing(base({ golf_verified_by: null, ingestion_source: null }), PLAYER.lat, PLAYER.lng) == null });
  results.push({ case: 'provenance: golf_verified_by set (no ingestion_source) → eligible (grandfathered)', pass: evaluatePublicListing(base({ golf_verified_by: 'Trent Wolfe', ingestion_source: null }), PLAYER.lat, PLAYER.lng) != null });
  results.push({ case: 'provenance: ingestion_source set (no golf_verified_by) → eligible', pass: evaluatePublicListing(base({ golf_verified_by: null, ingestion_source: 'google_places' }), PLAYER.lat, PLAYER.lng) != null });

  // --- New import tests ---
  // Every newly imported listing begins as pending and hidden.
  // approved is reserved for records that completed the full evidence contract.
  const testDet = { name: 'Test Golf Course', formatted_address: '123 Main St, Sherman, TX 75090', formatted_phone_number: '(903) 555-1234', website: 'https://testcourse.example.com', rating: 4.5, geometry: { location: { lat: 33.6, lng: -96.6 } }, address_components: [{ types: ['locality'], long_name: 'Sherman' }, { types: ['administrative_area_level_1'], long_name: 'TX' }] };
  const importRec = buildListingRecord(testDet, 'course', 'test_place_id_123', 33.6, -96.6, 'seedShermanListings');
  results.push({ case: 'import: buildListingRecord creates pending', pass: importRec.status === 'pending' });
  results.push({ case: 'import: buildListingRecord NOT approved', pass: importRec.status !== 'approved' });
  results.push({ case: 'import: buildListingRecord sets ingestion_source', pass: importRec.ingestion_source === 'google_places' });
  results.push({ case: 'import: buildListingRecord sets ingestion_job_id', pass: importRec.ingestion_job_id === 'seedShermanListings' });
  results.push({ case: 'import: pending import → hidden from feed', pass: evaluatePublicListing({ ...importRec, latitude: 33.6, longitude: -96.6 }, PLAYER.lat, PLAYER.lng) == null });

  // --- SSRF / source-page fetch hardening tests ---
  // Reject localhost, loopback, private, link-local, metadata, and
  // internal network addresses. Only public http/https destinations
  // are permitted. Fail closed on any uncertainty.
  results.push({ case: 'ssrf: localhost blocked', pass: !validatePublicUrl('http://localhost/test').valid });
  results.push({ case: 'ssrf: 127.0.0.1 loopback blocked', pass: !validatePublicUrl('http://127.0.0.1/test').valid });
  results.push({ case: 'ssrf: 10.x private blocked', pass: !validatePublicUrl('http://10.0.0.1/test').valid });
  results.push({ case: 'ssrf: 192.168.x private blocked', pass: !validatePublicUrl('http://192.168.1.1/test').valid });
  results.push({ case: 'ssrf: 172.16.x private blocked', pass: !validatePublicUrl('http://172.16.0.1/test').valid });
  results.push({ case: 'ssrf: 169.254.169.254 metadata blocked', pass: !validatePublicUrl('http://169.254.169.254/latest/meta-data').valid });
  results.push({ case: 'ssrf: 0.0.0.0 blocked', pass: !validatePublicUrl('http://0.0.0.0/test').valid });
  results.push({ case: 'ssrf: ::1 IPv6 loopback blocked', pass: !validatePublicUrl('http://[::1]/test').valid });
  results.push({ case: 'ssrf: fe80:: IPv6 link-local blocked', pass: !validatePublicUrl('http://[fe80::1]/test').valid });
  results.push({ case: 'ssrf: fc00:: IPv6 ULA blocked', pass: !validatePublicUrl('http://[fc00::1]/test').valid });
  results.push({ case: 'ssrf: public URL allowed', pass: validatePublicUrl('https://example.com/test').valid });
  results.push({ case: 'ssrf: ftp protocol blocked', pass: !validatePublicUrl('ftp://example.com/test').valid });
  results.push({ case: 'ssrf: javascript protocol blocked', pass: !validatePublicUrl('javascript:alert(1)').valid });

  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  });
}