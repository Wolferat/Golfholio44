import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { nearbySearch, placeDetails, geocode, isGolfRelated } from '../../shared/googlePlaces.ts';
import { isTrustedSourceUrl, isValidUrl } from '../../shared/publicListingPolicy.ts';

// ============================================================
// runTournamentCoverage — server-controlled tournament discovery.
//
// This function is called ONLY by the TournamentCoverage workflow
// (which is INACTIVE). It is never triggered by player actions.
//
// It discovers candidate golf events from authoritative sources,
// validates them, deduplicates against existing listings, and
// creates PENDING listing records (never player-visible).
//
// Safety:
//   - SSRF protection (blocks private/internal IPs)
//   - Source allowlist (only authoritative golf sources)
//   - Bounded retries and rate limits
//   - LLM extraction fails closed on ambiguous/inconsistent sources
//   - Google Places used for host-venue identity/coords/dedup ONLY
//   - Never uses AI to invent missing details
//   - Never lets pending candidates become player-visible
//   - Avoids rechecking the same source unnecessarily
// ============================================================

// --- SSRF Protection ---
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  const parts = h.split('.');
  if (parts.length === 4) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

function isAllowedSource(url: string): boolean {
  if (!isValidUrl(url)) return false;
  if (!isTrustedSourceUrl(url)) return false;
  try {
    const host = new URL(url).hostname;
    if (isPrivateHost(host)) return false;
    return true;
  } catch { return false; }
}

// --- Deduplication ---
function dedupKey(candidate: any): string {
  const title = (candidate.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  const date = (candidate.starts_at || '').slice(0, 10);
  const venue = (candidate.venue_name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return `${title}|${date}|${venue}`;
}

function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch { return url.toLowerCase(); }
}

// --- Source page fetch with timeout and size limit ---
async function fetchSourcePage(url: string): Promise<string | null> {
  if (!isAllowedSource(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Golfholio-Coverage/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 500000) return text.slice(0, 500000);
    return text;
  } catch { return null; }
}

// --- LLM extraction with fail-closed ---
async function extractEventFromSource(
  base44: any,
  sourceUrl: string,
  pageContent: string,
  venueContext: any
): Promise<any | null> {
  if (!pageContent || pageContent.length < 200) return null;

  const prompt = `You are a golf tournament extraction assistant. Extract ONLY information that is explicitly stated on this source page. NEVER invent, guess, or infer any field.

Source URL: ${sourceUrl}
Venue context: ${JSON.stringify(venueContext)}

Page content (first 30000 chars):
${pageContent.slice(0, 30000)}

Extract a golf event with these fields. If a field is not explicitly stated, return null for it:
- name: event title
- starts_at: ISO 8601 start datetime (or null)
- ends_at: ISO 8601 end datetime (or null)
- event_timezone: IANA timezone (e.g. America/Chicago) (or null)
- individual_entry_fee: number (or null)
- team_entry_fee: number (or null)
- currency: ISO 4217 code (or null)
- event_format: string (or null)
- team_size: number (or null)
- eligibility: string (or null)
- included_items: string (or null)
- registration_deadline: ISO 8601 (or null)
- official_registration_url: URL (or null)
- contact_email: string (or null)
- contact_phone: string (or null)

Rules:
1. ONLY extract information that is explicitly stated on the page.
2. If you cannot find a clear event title and at least one date, return null.
3. If the page is not about a golf event, return null.
4. NEVER invent pricing, dates, format, or any other detail.
5. If the source is ambiguous or inconsistent, return null.

Return a JSON object or null.`;

  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          starts_at: { type: 'string' },
          ends_at: { type: 'string' },
          event_timezone: { type: 'string' },
          individual_entry_fee: { type: 'number' },
          team_entry_fee: { type: 'number' },
          currency: { type: 'string' },
          event_format: { type: 'string' },
          team_size: { type: 'number' },
          eligibility: { type: 'string' },
          included_items: { type: 'string' },
          registration_deadline: { type: 'string' },
          official_registration_url: { type: 'string' },
          contact_email: { type: 'string' },
          contact_phone: { type: 'string' },
        },
      },
    });

    if (!result || !result.name) return null;
    // Fail closed: require at least a title and a start date
    if (!result.starts_at) return null;
    return result;
  } catch {
    return null;
  }
}

// --- Validate candidate ---
function validateCandidate(candidate: any): { valid: boolean; reason: string | null } {
  if (!candidate.name || candidate.name.trim().length < 3) return { valid: false, reason: 'missing or too-short title' };
  if (!candidate.starts_at || isNaN(new Date(candidate.starts_at).getTime())) return { valid: false, reason: 'missing or invalid start date' };
  if (!candidate.ends_at || isNaN(new Date(candidate.ends_at).getTime())) return { valid: false, reason: 'missing or invalid end date' };
  if (new Date(candidate.ends_at) < new Date(candidate.starts_at)) return { valid: false, reason: 'end before start' };
  if (!candidate.source_url || !isAllowedSource(candidate.source_url)) return { valid: false, reason: 'missing or untrusted source URL' };
  if (candidate.latitude == null || candidate.longitude == null) return { valid: false, reason: 'missing coordinates' };
  return { valid: true, reason: null };
}

// --- Extract city/state from address components ---
function getCityState(components: any[]): { city: string | null; state: string | null } {
  const city = components?.find((c) => c.types?.includes('locality'))?.long_name || null;
  const state = components?.find((c) => c.types?.includes('administrative_area_level_1'))?.short_name || null;
  return { city, state };
}

// --- Main ---
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    let coverageRequestId = body.coverage_request_id;
    let lat = Number(body.lat);
    let lng = Number(body.lng);
    let radius = Math.min(Math.max(Number(body.radius) || 15, 1), 30);
    const sourceUrls: string[] = Array.isArray(body.source_urls) ? body.source_urls : [];

    // If no lat/lng provided, fetch the oldest pending CoverageRequest
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const pending = await base44.asServiceRole.entities.CoverageRequest
        .filter({ status: 'pending' }, 'created_date', 1)
        .catch(() => []);
      if (pending.length === 0) {
        return Response.json({ status: 'no_pending_requests', message: 'No pending coverage requests to process' });
      }
      const req0 = pending[0];
      lat = Number(req0.latitude);
      lng = Number(req0.longitude);
      radius = Math.min(Math.max(Number(req0.radius_miles) || 15, 1), 30);
      coverageRequestId = req0.id;
    }

    // Update CoverageRequest status if provided
    if (coverageRequestId) {
      await base44.asServiceRole.entities.CoverageRequest.update(coverageRequestId, {
        status: 'processing',
        last_run_at: new Date().toISOString(),
      }).catch(() => {});
    }

    const exclusionReasons: any[] = [];
    const candidates: any[] = [];

    // Step 1: Use Google Places for host-venue identity and coordinates ONLY.
    // Google Places is NOT authoritative for dates, fees, or event details.
    const googleKey = secrets.get('GOOGLE_PLACES_API_KEY');
    let venueDetails: any[] = [];
    if (googleKey) {
      try {
        // Search for golf courses nearby (bounded: max 20 results)
        const nearby = await nearbySearch(googleKey, lat, lng, radius * 1609.34, 'golf_course', null);
        // Get full details for each venue (bounded: max 20)
        for (const place of nearby.slice(0, 20)) {
          const det = await placeDetails(googleKey, place.place_id).catch(() => null);
          if (!det) continue;
          // Only include golf-related venues
          const golfCheck = isGolfRelated(det);
          if (!golfCheck.isGolf) {
            exclusionReasons.push({ source: det.name, reason: `not golf-related: ${golfCheck.reason}` });
            continue;
          }
          if (!det.website || !isAllowedSource(det.website)) {
            exclusionReasons.push({ source: det.name, reason: 'no allowed official website' });
            continue;
          }
          const { city, state } = getCityState(det.address_components);
          venueDetails.push({
            name: det.name,
            website: det.website,
            lat: det.geometry?.location?.lat,
            lng: det.geometry?.location?.lng,
            address: det.formatted_address,
            city,
            state,
          });
        }
      } catch (err) {
        exclusionReasons.push({ source: 'google_places', reason: `nearby search failed: ${err.message}` });
      }
    }

    // Step 2: For each venue, fetch the official website and extract events.
    // The official website is the authoritative source for event details.
    const seenSources = new Set<string>();
    for (const venue of venueDetails) {
      const key = urlKey(venue.website);
      if (seenSources.has(key)) continue; // Avoid rechecking same source
      seenSources.add(key);

      const pageContent = await fetchSourcePage(venue.website);
      if (!pageContent) {
        exclusionReasons.push({ source: venue.website, reason: 'could not fetch source page' });
        continue;
      }

      const extracted = await extractEventFromSource(base44, venue.website, pageContent, {
        name: venue.name,
        address: venue.address,
      });

      if (!extracted) {
        exclusionReasons.push({ source: venue.website, reason: 'no valid event extracted (ambiguous or no golf event)' });
        continue;
      }

      const candidate = {
        ...extracted,
        venue_name: venue.name,
        city: venue.city,
        state: venue.state,
        address: venue.address,
        latitude: venue.lat,
        longitude: venue.lng,
        source_url: venue.website,
        source_type: 'official_website',
      };

      const validation = validateCandidate(candidate);
      if (!validation.valid) {
        exclusionReasons.push({ source: venue.website, reason: validation.reason });
        continue;
      }

      candidates.push(candidate);
    }

    // Step 3: Also check explicitly provided source URLs (from admin or future player request)
    for (const sourceUrl of sourceUrls.slice(0, 10)) {
      if (!isAllowedSource(sourceUrl)) {
        exclusionReasons.push({ source: sourceUrl, reason: 'source not allowed' });
        continue;
      }
      const key = urlKey(sourceUrl);
      if (seenSources.has(key)) continue;
      seenSources.add(key);

      const pageContent = await fetchSourcePage(sourceUrl);
      if (!pageContent) {
        exclusionReasons.push({ source: sourceUrl, reason: 'could not fetch source page' });
        continue;
      }

      const extracted = await extractEventFromSource(base44, sourceUrl, pageContent, {});
      if (!extracted) {
        exclusionReasons.push({ source: sourceUrl, reason: 'no valid event extracted' });
        continue;
      }

      // Geocode the venue if coordinates are missing
      if (extracted.latitude == null || extracted.longitude == null) {
        const gKey = secrets.get('GOOGLE_PLACES_API_KEY');
        if (gKey && (extracted.venue_name || extracted.city)) {
          const g = await geocode(gKey, `${extracted.venue_name || ''} ${extracted.city || ''}`.trim()).catch(() => null);
          if (g) {
            extracted.latitude = g.lat;
            extracted.longitude = g.lng;
          }
        }
      }

      const candidate = {
        ...extracted,
        source_url: sourceUrl,
        source_type: 'event_website',
      };

      const validation = validateCandidate(candidate);
      if (!validation.valid) {
        exclusionReasons.push({ source: sourceUrl, reason: validation.reason });
        continue;
      }

      candidates.push(candidate);
    }

    // Step 4: Deduplicate against existing listings and within candidates
    const existingListings = await base44.asServiceRole.entities.Listing.filter({}).catch(() => []);
    const existingKeys = new Set(existingListings.map((l) => dedupKey(l)));
    const existingUrls = new Set(existingListings.map((l) => urlKey(l.source_url || l.official_website || '')));
    const seenCandidates = new Set<string>();

    const accepted: any[] = [];
    for (const candidate of candidates) {
      const key = dedupKey(candidate);
      const urlK = urlKey(candidate.source_url);
      if (existingKeys.has(key) || existingUrls.has(urlK) || seenCandidates.has(key)) {
        exclusionReasons.push({ source: candidate.source_url, reason: 'duplicate' });
        continue;
      }
      seenCandidates.add(key);

      // Create as PENDING listing — never player-visible
      // golf_verified=false, status=pending, verification_tier=null
      await base44.asServiceRole.entities.Listing.create({
        name: candidate.name,
        type: 'tournament',
        venue_name: candidate.venue_name || null,
        city: candidate.city || null,
        state: candidate.state || null,
        address: candidate.address || null,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        starts_at: candidate.starts_at,
        ends_at: candidate.ends_at,
        event_timezone: candidate.event_timezone || null,
        registration_deadline: candidate.registration_deadline || null,
        individual_entry_fee: candidate.individual_entry_fee || null,
        team_entry_fee: candidate.team_entry_fee || null,
        currency: candidate.currency || 'USD',
        fee_status: candidate.fee_status || 'unknown',
        event_format: candidate.event_format || null,
        team_size: candidate.team_size || null,
        eligibility: candidate.eligibility || null,
        included_items: candidate.included_items || null,
        contact_email: candidate.contact_email || null,
        phone: candidate.contact_phone || null,
        official_website: candidate.source_url,
        official_registration_url: candidate.official_registration_url || null,
        source_url: candidate.source_url,
        source_type: candidate.source_type,
        status: 'pending',
        golf_verified: false,
        verification_tier: null,
        ingestion_source: 'tournament_coverage_workflow',
      }).catch(() => {});

      accepted.push(candidate);
    }

    // Step 5: Update CoverageRequest
    if (coverageRequestId) {
      await base44.asServiceRole.entities.CoverageRequest.update(coverageRequestId, {
        status: 'completed',
        last_run_at: new Date().toISOString(),
        result_count: candidates.length,
        accepted_count: accepted.length,
        exclusion_reasons: JSON.stringify(exclusionReasons).slice(0, 10000),
      }).catch(() => {});
    }

    return Response.json({
      status: 'completed',
      venues_checked: venueDetails.length,
      sources_checked: seenSources.size,
      candidates_found: candidates.length,
      accepted: accepted.length,
      excluded: exclusionReasons.length,
      exclusion_reasons: exclusionReasons,
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      if (body.coverage_request_id) {
        await base44.asServiceRole.entities.CoverageRequest.update(body.coverage_request_id, {
          status: 'failed',
          error_message: String(error.message || error).slice(0, 500),
          last_run_at: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch {}
    return Response.json({ error: error.message || 'Coverage failed' }, { status: 500 });
  }
}