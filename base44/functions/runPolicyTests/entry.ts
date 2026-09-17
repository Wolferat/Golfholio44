import {
  evaluatePublicListing,
  publicPhoto,
} from '../../shared/publicListingPolicy.ts';

// Server-side policy test harness. Runs the shared predicate against
// synthetic in-memory records. Does NOT touch the database, does NOT
// modify any listing data, and calls no external API.
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

const cases = [
  { name: 'approved golf-verified within 15mi → eligible', rec: base({}), expect: true },
  { name: 'church (golf_verified false) → hidden', rec: base({ golf_verified: false, name: 'St Mary Church Golf Room' }), expect: false },
  { name: 'school → hidden', rec: base({ golf_verified: false, name: 'Sherman High School' }), expect: false },
  { name: 'hotel → hidden', rec: base({ golf_verified: false, name: 'Sherman Grand Hotel' }), expect: false },
  { name: 'restaurant → hidden', rec: base({ golf_verified: false, name: 'Fairway Restaurant' }), expect: false },
  { name: 'retail store → hidden', rec: base({ golf_verified: false, name: 'Golf Gear Retail' }), expect: false },
  { name: 'adult/unsafe business → hidden', rec: base({ golf_verified: false, name: 'Adult Golf Lounge' }), expect: false },
  { name: 'random google result → hidden', rec: base({ golf_verified: false }), expect: false },
  { name: 'golf_verified false (name contains golf) → hidden', rec: base({ golf_verified: false, name: 'Golf World' }), expect: false },
  { name: 'no tier 1-4 (tier 5) → hidden', rec: base({ verification_tier: 5 }), expect: false },
  { name: 'no tier (null) → hidden', rec: base({ verification_tier: null }), expect: false },
  { name: 'no source_url → hidden', rec: base({ source_url: '' }), expect: false },
  { name: 'invalid source_url → hidden', rec: base({ source_url: 'not a url' }), expect: false },
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

export default async function () {
  const results = cases.map((c) => {
    if (c.photoExpect !== undefined) {
      const got = publicPhoto(c.rec);
      return { case: c.name, pass: got === c.photoExpect, got };
    }
    const ev = evaluatePublicListing(c.rec, PLAYER.lat, PLAYER.lng);
    const eligible = ev != null;
    return { case: c.name, pass: eligible === c.expect, eligible };
  });
  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  });
}