import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { checkPublicListing } from '../../shared/publicListingPolicy.ts';
import {
  SHERMAN_IMPORT_CENTER,
  assertApiKeyPresent,
  buildOpenAIRequestBody,
  clampImportRadius,
  parseOpenAIResponse,
  planQueryPlan,
} from '../../shared/openaiDiscovery.ts';
import {
  evaluateLead,
  findExistingDuplicate,
} from '../../shared/officialSourceVerification.ts';

// ============================================================
// runShermanDiscoveryTests — admin-only, SYNTHETIC ONLY.
//
// No OpenAI calls, no Google calls, no network fetches, and no
// database writes. Every case uses fixed fixtures so it cannot
// spend API credits or create/modify Listing records.
// ============================================================

const NOW = '2026-01-01T00:00:00.000Z';
const COURSE_PAGE =
  'Pecan Grove Golf Club is an 18-hole championship golf course in Sherman, Texas. ' +
  'Visit us at 1234 Fairway Drive, Sherman, TX 75090. Call (903) 555-1234 to book a tee time.';
const COURSE_GEO = { lat: 33.6405, lng: -96.6102 };

const COURSE_LEAD = {
  name: 'Pecan Grove Golf Club',
  category: 'course',
  city: 'Sherman',
  state: 'TX',
  address: '1234 Fairway Drive, Sherman, TX 75090',
  website: 'https://pecangrovegc.com',
  latitude: 33.641,
  longitude: -96.609,
  phone: '(903) 555-1234',
};

function base(overrides: any = {}) {
  return {
    center: SHERMAN_IMPORT_CENTER,
    radiusMi: 30,
    existingListings: [],
    jobId: 'synthetic-job',
    nowIso: NOW,
    ...overrides,
  };
}

function evalLead(lead: any, pageText: string, geocoded: any, extra: any = {}) {
  return evaluateLead({
    lead,
    pageText,
    sourceUrl: lead.website || '',
    finalUrl: lead.website || '',
    geocoded,
    ...base(extra),
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const results: any[] = [];
    const expect = (name: string, pass: boolean, detail = '') => {
      results.push({ name, pass: !!pass, detail });
    };

    // ---------------- Accepted official golf venues ----------------
    const course = evalLead(COURSE_LEAD, COURSE_PAGE, COURSE_GEO);
    expect('accepts a corroborated golf course', course.status === 'accepted', course.reason);
    expect(
      'approved course satisfies the public listing policy',
      !!course.listing && checkPublicListing(course.listing, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).pass,
      course.listing ? String(checkPublicListing(course.listing, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).firstFailingReason || '') : 'no listing'
    );
    expect(
      'approved course stores only verified provenance fields',
      !!course.listing &&
        course.listing.source_type === 'official_website' &&
        course.listing.verification_tier === 2 &&
        course.listing.ingestion_source === 'openai_web_search' &&
        course.listing.rating === null &&
        course.listing.description === '' &&
        Array.isArray(course.listing.photos) &&
        course.listing.photos.length === 0 &&
        course.listing.photo_verified === false,
      course.listing ? JSON.stringify({
        source_type: course.listing.source_type,
        tier: course.listing.verification_tier,
        rating: course.listing.rating,
        photos: course.listing.photos,
      }) : 'no listing'
    );

    const simulator = evalLead(
      {
        name: 'Texoma Indoor Golf',
        category: 'indoor_simulator',
        city: 'Denison',
        state: 'TX',
        address: '2200 W Main St, Denison, TX 75020',
        website: 'https://texomaindoorgolf.com',
        latitude: 33.755,
        longitude: -96.536,
        phone: '',
      },
      'Texoma Indoor Golf offers Trackman golf simulators and indoor golf bays in Denison, Texas. 2200 W Main St, Denison, TX 75020. Book a simulator bay online.',
      { lat: 33.7548, lng: -96.5361 }
    );
    expect('accepts a corroborated indoor simulator', simulator.status === 'accepted', simulator.reason);

    const range = evalLead(
      {
        name: 'Fairway Practice Center',
        category: 'driving_range',
        city: 'Sherman',
        state: 'TX',
        address: '900 Practice Ln, Sherman, TX 75090',
        website: 'https://fairwaypracticecenter.com',
        latitude: 33.65,
        longitude: -96.62,
        phone: '',
      },
      'Fairway Practice Center is a golf driving range in Sherman, Texas with grass tees and range balls. 900 Practice Ln, Sherman, TX 75090.',
      { lat: 33.6502, lng: -96.6199 }
    );
    expect('accepts a corroborated driving range', range.status === 'accepted', range.reason);
    expect('driving range maps to an allowed entity type', range.listing?.type === 'golf_related_venue', String(range.listing?.type));

    const instruction = evalLead(
      {
        name: 'Red River Golf Academy',
        category: 'golf_instruction',
        city: 'Sherman',
        state: 'TX',
        address: '77 Range Rd, Sherman, TX 75092',
        website: 'https://redrivergolfacademy.com',
        latitude: 33.63,
        longitude: -96.6,
        phone: '',
      },
      'Red River Golf Academy provides golf lessons and instruction with PGA professionals in Sherman, Texas. 77 Range Rd, Sherman, TX 75092.',
      { lat: 33.6301, lng: -96.6002 }
    );
    expect('accepts a corroborated golf instruction venue', instruction.status === 'accepted', instruction.reason);

    // ---------------- Negative examples ----------------
    const negatives = [
      ['medical office', 'Sherman Family Medical Clinic'],
      ['hotel', 'Texoma Inn & Suites'],
      ['restaurant', "Bubba's BBQ Restaurant"],
      ['bar without golf', 'The Rusty Tap Bar & Grill'],
      ['disc golf', 'Texoma Disc Golf Park'],
      ['adult/unsafe', "Sensations Gentlemen's Club"],
    ];
    for (const [label, name] of negatives) {
      const r = evalLead(
        {
          name,
          category: 'course',
          city: 'Sherman',
          state: 'TX',
          address: '1 Main St, Sherman, TX 75090',
          website: 'https://example.com',
          latitude: 33.64,
          longitude: -96.61,
          phone: '',
        },
        'Sherman Texas business.',
        { lat: 33.64, lng: -96.61 }
      );
      expect(`rejects ${label}`, r.status === 'rejected', `${r.status}: ${r.reason}`);
    }

    const unsupported = evalLead(
      {
        name: 'Hidden Creek Golf Club',
        category: 'course',
        city: 'Sherman',
        state: 'TX',
        address: '12 Creek Rd, Sherman, TX 75090',
        website: 'https://www.yelp.com/biz/hidden-creek-golf-club',
        latitude: 33.64,
        longitude: -96.61,
        phone: '',
      },
      'Hidden Creek Golf Club is an 18-hole golf course in Sherman, Texas.',
      { lat: 33.64, lng: -96.61 }
    );
    expect('does not approve a directory-only website', unsupported.status !== 'accepted', `${unsupported.status}: ${unsupported.reason}`);

    const noCoords = evalLead(COURSE_LEAD, COURSE_PAGE, null);
    expect('leaves a venue pending when coordinates cannot be corroborated', noCoords.status === 'pending', `${noCoords.status}: ${noCoords.reason}`);

    const outOfRadius = evalLead(
      {
        name: 'Lone Star National Golf Club',
        category: 'course',
        city: 'Dallas',
        state: 'TX',
        address: '5000 Golf Rd, Dallas, TX 75201',
        website: 'https://lonestarnationalgc.com',
        latitude: 32.78,
        longitude: -96.8,
        phone: '',
      },
      'Lone Star National Golf Club is an 18-hole championship golf course in Dallas, Texas at 5000 Golf Rd, Dallas, TX 75201.',
      { lat: 32.7767, lng: -96.797 }
    );
    expect('rejects a venue outside the import radius', outOfRadius.status === 'rejected', `${outOfRadius.status}: ${outOfRadius.reason}`);

    const duplicate = evalLead(COURSE_LEAD, COURSE_PAGE, COURSE_GEO, {
      existingListings: [
        {
          id: 'existing-1',
          name: 'Pecan Grove Golf Club',
          city: 'Sherman',
          address: '1234 Fairway Drive, Sherman, TX 75090',
          official_website: 'https://pecangrovegc.com',
          latitude: 33.6405,
          longitude: -96.6102,
          status: 'approved',
        },
      ],
    });
    expect('marks an existing venue as a duplicate instead of overwriting it', duplicate.status === 'duplicate', `${duplicate.status}: ${duplicate.reason}`);

    const disagreement = evalLead(
      { ...COURSE_LEAD, latitude: 33.95, longitude: -96.95 },
      COURSE_PAGE,
      COURSE_GEO
    );
    expect('leaves source-disagreement candidates pending', disagreement.status === 'pending', `${disagreement.status}: ${disagreement.reason}`);

    const fetchFailed = evalLead(COURSE_LEAD, '', COURSE_GEO);
    expect('never approves when the official page could not be corroborated', fetchFailed.status === 'pending', `${fetchFailed.status}: ${fetchFailed.reason}`);

    const wrongCategory = evalLead(
      { ...COURSE_LEAD, category: 'indoor_simulator' },
      COURSE_PAGE,
      COURSE_GEO
    );
    expect('requires the official page to support the exact category', wrongCategory.status === 'pending', `${wrongCategory.status}: ${wrongCategory.reason}`);

    // ---------------- Secret absent / OpenAI failure modes ----------------
    expect('treats a missing key as not configured', assertApiKeyPresent(undefined) === false && assertApiKeyPresent('') === false);
    expect('treats a present key as configured', assertApiKeyPresent('sk-test-not-a-real-key') === true);

    const apiError = parseOpenAIResponse({ error: { message: 'boom', code: 'server_error' } });
    expect('fails closed on an OpenAI error', apiError.ok === false, apiError.reason);

    const refusal = parseOpenAIResponse({
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot assist' }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });
    expect('fails closed on an OpenAI refusal', refusal.ok === false && refusal.refusal === true, refusal.reason);

    const malformed = parseOpenAIResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    });
    expect('fails closed on malformed output', malformed.ok === false, malformed.reason);

    const incomplete = parseOpenAIResponse({ status: 'incomplete' });
    expect('fails closed on an incomplete response', incomplete.ok === false, incomplete.reason);

    const valid = parseOpenAIResponse({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify({ leads: [{ ...COURSE_LEAD, category: 'course' }] }) }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    expect('parses a valid structured response', valid.ok === true && valid.leads.length === 1 && valid.usage.total_tokens === 15, valid.reason);

    // ---------------- Query plan + request shape ----------------
    const plan30 = planQueryPlan(30);
    expect('plans 24 tiled queries at 30 miles', plan30.queries.length === 24, String(plan30.queries.length));
    expect('all tiles are inside the default 30-mile boundary', plan30.tilesSkipped.length === 0, JSON.stringify(plan30.tilesSkipped));

    const plan10 = planQueryPlan(10);
    expect('smaller radius excludes far tiles explicitly', plan10.tilesSkipped.length === 2 && plan10.queries.length === 16, JSON.stringify({
      skipped: plan10.tilesSkipped.map((t) => t.city),
      queries: plan10.queries.length,
    }));

    expect('clamps an oversized import radius to 30', clampImportRadius(999) === 30 && clampImportRadius(0) === 5);

    const requestBody = buildOpenAIRequestBody('public golf courses in Sherman, TX');
    expect(
      'uses the Responses API web_search tool and no Google/LLM integration',
      requestBody.tools?.[0]?.type === 'web_search' &&
        !JSON.stringify(requestBody).toLowerCase().includes('google_places') &&
        !JSON.stringify(requestBody).toLowerCase().includes('invokellm'),
      JSON.stringify(requestBody.tools)
    );

    // ---------------- Automatic approval path audit ----------------
    const coverageStyle = {
      name: 'Coverage Style Course',
      type: 'course',
      status: 'approved',
      golf_verified: true,
      verification_tier: 2,
      source_url: 'https://example.com',
      verified_at: NOW,
      verified_by: 'coverage_discovery',
      latitude: 33.64,
      longitude: -96.61,
      official_website: 'https://example.com',
    };
    expect(
      'coverage-style automated approval satisfies the trust gate',
      checkPublicListing(coverageStyle, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).pass === true,
      String(checkPublicListing(coverageStyle, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).firstFailingReason || '')
    );

    const bareIngestion = {
      name: 'Bare Ingestion Course',
      type: 'course',
      status: 'approved',
      latitude: 33.64,
      longitude: -96.61,
      ingestion_source: 'some_import',
      ingestion_job_id: 'job-1',
    };
    expect(
      'ingestion provenance alone cannot pass the trust gate',
      checkPublicListing(bareIngestion, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).pass === false,
      'expected policy failure'
    );

    const missingSource = { ...coverageStyle, source_url: '', official_website: '' };
    expect(
      'approval without an official source is blocked',
      checkPublicListing(missingSource, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 30).pass === false,
      'expected policy failure'
    );

    const outOfPlayerRadius = { ...coverageStyle, latitude: 33.9, longitude: -96.9 };
    expect(
      'the 15-mile player policy still hides distant venues',
      checkPublicListing(outOfPlayerRadius, SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, 15).pass === false,
      'expected policy failure at 15 miles'
    );

    // ---------------- Dedup helper ----------------
    const dupCheck = findExistingDuplicate(
      { name: 'Pecan Grove Golf Club', address: '1234 Fairway Drive, Sherman, TX 75090', website: 'https://pecangrovegc.com', city: 'Sherman', coords: COURSE_GEO },
      [{ id: 'x', name: 'Pecan Grove Golf Club', city: 'Sherman', address: '1234 Fairway Drive, Sherman, TX 75090', official_website: 'https://pecangrovegc.com' }]
    );
    expect('deduplicates by official domain / name / address', dupCheck.isDuplicate === true, dupCheck.reason);

    const passed = results.filter((r) => r.pass).length;
    const failed = results.length - passed;

    return Response.json({
      no_api_calls_made: true,
      no_writes_made: true,
      total: results.length,
      passed,
      failed,
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}