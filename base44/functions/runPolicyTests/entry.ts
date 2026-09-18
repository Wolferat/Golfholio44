import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  evaluatePublicListing,
  publicPhoto,
} from '../../shared/publicListingPolicy.ts';

// Server-side policy test harness. Runs the shared predicate against
// synthetic in-memory records AND actual current database records.
// Does NOT modify any listing data, does NOT call any external API.
function base(overrides) {
  return {
    name: 'Test Course',
    status: 'approved',
    golf_verified: true,
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

  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  });
}