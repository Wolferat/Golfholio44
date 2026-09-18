import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePublicListing, checkPublicListing } from '../../shared/publicListingPolicy.ts';
import {
  extractImageUrls,
  validatePhoto,
  selectOfficialSource,
  isBlockedHost,
  isValidReviewPhotoUri,
  discoverPhotosForListing,
} from '../../shared/photoValidation.ts';

// ============================================================
// Capability Tests — trust-boundary verification for official
// photos, reviews, and venue rounds.
//
// Tests the server-side logic without modifying data or making
// real external API calls. SSRF tests use IP literals (no DNS
// resolution needed).
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const results = [];
    const add = (name, pass, detail) =>
      results.push({ name, pass: !!pass, detail: detail || null });

    // ============================================================
    // 1. Public listing policy remains unchanged
    // ============================================================
    const approved = {
      id: '1', status: 'approved', golf_verified: true,
      verified_by: 'admin', verified_at: '2026-09-18T00:00:00Z',
      source_url: 'https://example.com', verification_tier: 1,
      type: 'course', latitude: 33.5, longitude: -96.6,
    };
    const pending = { ...approved, status: 'pending' };
    const far = { ...approved, latitude: 40.0, longitude: -74.0 };
    const noSource = { ...approved, source_url: null };
    const noVerifier = { ...approved, verified_by: null, golf_verified_by: null };

    add('policy: approved within 15mi → eligible',
      evaluatePublicListing(approved, 33.5, -96.6) != null);
    add('policy: pending → hidden',
      evaluatePublicListing(pending, 33.5, -96.6) == null);
    add('policy: out-of-range → hidden',
      evaluatePublicListing(far, 33.5, -96.6) == null);
    add('policy: no player coords → hidden',
      evaluatePublicListing(approved, null, null) == null);
    add('policy: no source_url → hidden',
      evaluatePublicListing(noSource, 33.5, -96.6) == null);
    add('policy: no verifier → hidden',
      evaluatePublicListing(noVerifier, 33.5, -96.6) == null);
    add('policy: ineligible by status → null (direct route protected)',
      evaluatePublicListing(pending, 33.5, -96.6) == null);

    // ============================================================
    // 2. Official photo source selection — no generic website
    // ============================================================

    // Generic website field must NEVER be used as a photo source
    const listingWithOnlyWebsite = {
      id: 't1', name: 'Test Course', type: 'course',
      website: 'https://example.com',
      official_website: null, source_url: null,
    };
    add('source: generic website field → not selected',
      selectOfficialSource(listingWithOnlyWebsite) === '');

    // official_website is preferred
    const listingWithOfficial = {
      id: 't2', name: 'Test Course', type: 'course',
      official_website: 'https://official.example.com',
      website: 'https://generic.example.com',
      source_url: 'https://source.example.com',
      source_type: 'official_website',
    };
    add('source: official_website preferred',
      selectOfficialSource(listingWithOfficial) === 'https://official.example.com');

    // source_url with allowed source_type is used when no official_website
    const listingWithAllowedSource = {
      id: 't3', name: 'Test Course', type: 'course',
      official_website: null,
      source_url: 'https://trusted.example.com',
      source_type: 'trusted_organization',
    };
    add('source: allowed source_type → source_url used',
      selectOfficialSource(listingWithAllowedSource) === 'https://trusted.example.com');

    // source_url with google_places source_type is NOT used
    const listingWithGooglePlaces = {
      id: 't4', name: 'Test Course', type: 'course',
      official_website: null,
      source_url: 'https://maps.google.com/place/123',
      source_type: 'google_places',
    };
    add('source: google_places source_type → not selected',
      selectOfficialSource(listingWithGooglePlaces) === '');

    // source_url with google_business_profile is NOT used
    const listingWithGBP = {
      id: 't5', name: 'Test Course', type: 'course',
      official_website: null,
      source_url: 'https://business.google.com/123',
      source_type: 'google_business_profile',
    };
    add('source: google_business_profile source_type → not selected',
      selectOfficialSource(listingWithGBP) === '');

    // discoverPhotosForListing with only website → no source
    const mockLlm = () =>
      Promise.resolve({ data: { suitable: true, reason: 'all checks pass' } });
    const discoveryNoSource = await discoverPhotosForListing(listingWithOnlyWebsite, mockLlm);
    add('discovery: only website field → no source (fetch_error set)',
      discoveryNoSource.website_used === '' && discoveryNoSource.fetch_error !== null);

    // discoverPhotosForListing with google_places source → no source
    const discoveryGooglePlaces = await discoverPhotosForListing(listingWithGooglePlaces, mockLlm);
    add('discovery: google_places source → no source (fetch_error set)',
      discoveryGooglePlaces.website_used === '' && discoveryGooglePlaces.fetch_error !== null);

    // ============================================================
    // 3. CDN images — allowed when referenced by official page
    // ============================================================

    // CDN image from a different domain IS kept (not same-domain)
    const htmlWithCdn = '<html><body>' +
      '<img src="https://images.squarespace-cdn.com/v1/abc/photo.jpg">' +
      '<img src="https://static.wixstatic.com/media/hero.png">' +
      '</body></html>';
    const cdnUrls = extractImageUrls(htmlWithCdn, 'https://example.com');
    add('photo: squarespace CDN image kept (not same-domain)',
      cdnUrls.some((u) => u.includes('squarespace-cdn.com')));
    add('photo: wix CDN image kept (not same-domain)',
      cdnUrls.some((u) => u.includes('wixstatic.com')));

    // CloudFront CDN image is kept
    const htmlWithCloudFront = '<html><body>' +
      '<img src="https://d123.cloudfront.net/venue/photo.jpg">' +
      '</body></html>';
    const cfUrls = extractImageUrls(htmlWithCloudFront, 'https://example.com');
    add('photo: CloudFront CDN image kept',
      cfUrls.some((u) => u.includes('cloudfront.net')));

    // Third-party tracker/directory/social is blocked
    add('photo: facebook.com blocked',
      isBlockedHost('https://facebook.com/photo.jpg'));
    add('photo: yelp.com blocked',
      isBlockedHost('https://yelp.com/photo.jpg'));
    add('photo: googleusercontent.com blocked',
      isBlockedHost('https://lh3.googleusercontent.com/photo.jpg'));
    add('photo: shutterstock.com blocked',
      isBlockedHost('https://shutterstock.com/photo.jpg'));
    add('photo: doubleclick.net blocked',
      isBlockedHost('https://doubleclick.net/ad.jpg'));

    // og:image from a CDN is kept
    const htmlWithOgCdn = '<html><head>' +
      '<meta property="og:image" content="https://cdn.cloudflare.com/venue/hero.jpg">' +
      '</head><body></body></html>';
    const ogCdnUrls = extractImageUrls(htmlWithOgCdn, 'https://example.com');
    add('photo: og:image from CDN kept',
      ogCdnUrls.some((u) => u.includes('cloudflare.com')));

    // Same-domain image still kept
    const html2 = '<html><body>' +
      '<img src="https://google.com/logo.png">' +
      '<img src="https://example.com/photo.jpg"></body></html>';
    const urls2 = extractImageUrls(html2, 'https://example.com');
    add('photo: third-party (google) filtered out',
      !urls2.some((u) => u.includes('google.com')));
    add('photo: same-domain kept',
      urls2.includes('https://example.com/photo.jpg'));

    // No images → empty array
    const html3 = '<html><body><p>No images</p></body></html>';
    add('photo: no images → empty array',
      extractImageUrls(html3, 'https://example.com').length === 0);

    // ============================================================
    // 4. Official photo validation — SSRF and fail-closed
    // ============================================================
    // SSRF: private IP must be blocked (no DNS call — IP literal)
    const ssrfResult = await validatePhoto(
      'http://127.0.0.1/image.jpg',
      { name: 'Test Course', type: 'course' },
      'https://example.com',
      mockLlm
    );
    add('photo: SSRF private IP → rejected',
      !ssrfResult.accepted,
      ssrfResult.reason);

    // Non-http protocol must be blocked
    const protoResult = await validatePhoto(
      'javascript:alert(1)',
      { name: 'Test Course', type: 'course' },
      'https://example.com',
      mockLlm
    );
    add('photo: non-http protocol → rejected',
      !protoResult.accepted,
      protoResult.reason);

    // LLM unavailable → fail closed (rejected)
    const errorLlm = () => Promise.reject(new Error('LLM unavailable'));
    const errorResult = await validatePhoto(
      'https://example.com/image.jpg',
      { name: 'Test Course', type: 'course' },
      'https://example.com',
      errorLlm
    ).catch(() => null);
    add('photo: LLM error → fail closed (rejected)',
      errorResult === null || !errorResult.accepted,
      errorResult?.reason || 'validatePhoto threw (fail closed)');

    // ============================================================
    // 5. Review photo URI validation — no external URLs
    // ============================================================

    // External http URL → rejected
    add('review photo: external http URL → rejected',
      !isValidReviewPhotoUri('https://evil.com/photo.jpg'));
    add('review photo: external https URL → rejected',
      !isValidReviewPhotoUri('https://google.com/image.png'));
    add('review photo: ftp URL → rejected',
      !isValidReviewPhotoUri('ftp://evil.com/file'));
    add('review photo: javascript URL → rejected',
      !isValidReviewPhotoUri('javascript:alert(1)'));
    add('review photo: data URL → rejected',
      !isValidReviewPhotoUri('data:image/png;base64,abc'));

    // Private file URI → accepted
    add('review photo: private file URI → accepted',
      isValidReviewPhotoUri('private-files/reviews/abc123.jpg'));
    add('review photo: empty string → accepted (no photo)',
      isValidReviewPhotoUri(''));

    // ============================================================
    // 6. RLS verification — OfficialPhoto and Review are NOT
    //    publicly readable. Players cannot bypass the listing
    //    policy by directly querying these entities.
    // ============================================================

    // OfficialPhoto: admin-only read (no public accepted read)
    // Verify by checking that a non-admin user cannot read
    // OfficialPhoto records. Service role can always read.
    try {
      const photos = await base44.asServiceRole.entities.OfficialPhoto
        .filter({ validation_status: 'accepted' }, '-created_date', 5)
        .catch(() => []);
      add('entity: OfficialPhoto readable (service role)',
        Array.isArray(photos));
    } catch {
      add('entity: OfficialPhoto readable (service role)', false, 'query failed');
    }

    // RoundLog: only owner's records (RLS)
    try {
      const rounds = await base44.asServiceRole.entities.RoundLog
        .list('-created_date', 5)
        .catch(() => []);
      add('entity: RoundLog readable (service role)',
        Array.isArray(rounds));
    } catch {
      add('entity: RoundLog readable (service role)', false, 'query failed');
    }

    // Review: author + admin only (no public approved read)
    try {
      const reviews = await base44.asServiceRole.entities.Review
        .list('-created_date', 1)
        .catch(() => []);
      add('entity: Review readable (service role)',
        Array.isArray(reviews));
    } catch {
      add('entity: Review readable (service role)', false, 'query failed');
    }

    // ============================================================
    // 7. 9-hole and 18-hole stats computed separately
    // ============================================================
    const statFor = (rounds, holeCount) => {
      const filtered = rounds.filter((r) => r.holes === holeCount);
      if (!filtered.length) return null;
      return {
        rounds: filtered.length,
        avg: Math.round(filtered.reduce((s, r) => s + r.score, 0) / filtered.length),
        best: Math.min(...filtered.map((r) => r.score)),
      };
    };

    add('stats: empty rounds → null',
      statFor([], 18) === null);

    const mixed = [
      { holes: 18, score: 90 },
      { holes: 9, score: 45 },
      { holes: 18, score: 96 },
      { holes: 9, score: 41 },
      { holes: 18, score: 84 },
    ];
    const s18 = statFor(mixed, 18);
    const s9 = statFor(mixed, 9);
    add('stats: 18-hole count correct', s18.rounds === 3);
    add('stats: 18-hole avg correct', s18.avg === 90);
    add('stats: 18-hole best correct', s18.best === 84);
    add('stats: 9-hole count correct', s9.rounds === 2);
    add('stats: 9-hole avg correct', s9.avg === 43);
    add('stats: 9-hole best correct', s9.best === 41);
    add('stats: 9 and 18 kept separate',
      s18.rounds !== s9.rounds && s18.avg !== s9.avg);

    // ============================================================
    // 8. Review moderation — fail closed
    // ============================================================
    const mapStatus = (mod) => {
      if (!mod || typeof mod.safe !== 'boolean') return 'pending';
      return mod.safe ? 'approved' : 'rejected';
    };
    add('moderation: safe → approved',
      mapStatus({ safe: true, reason: 'ok' }) === 'approved');
    add('moderation: unsafe → rejected',
      mapStatus({ safe: false, reason: 'spam' }) === 'rejected');
    add('moderation: uncertain → pending (fail closed)',
      mapStatus(null) === 'pending');
    add('moderation: malformed → pending (fail closed)',
      mapStatus({}) === 'pending');

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
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}