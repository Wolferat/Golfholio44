// ============================================================
// Official-Source Verification — the deterministic trust gate for
// the OpenAI web_search import.
//
// A model lead is NEVER proof. Approval requires:
//   1. a real golf business (name exclusions)
//   2. a supported official venue website (not a directory/social)
//   3. the official PAGE independently corroborating identity +
//      a stable location fact (existing SSRF-hardened fetch)
//   4. the exact category supported by the official page text
//   5. coordinates resolved from the official address (Google
//      Geocoding — not Google Places) and agreed with the lead
//   6. server-calculated Haversine distance inside the import radius
//   7. no duplicate (domain / name+city / address / coords)
//   8. the existing publicListingPolicy trust gate passes
//
// Anything uncertain stays pending with a private reason. Nothing
// here weakens or bypasses the player-facing policy.
// ============================================================

import { evaluateCorroboration } from './automatedVerification.ts';
import { checkPublicListing, isTrustedSourceUrl } from './publicListingPolicy.ts';
import { checkImageUrl, extractImageUrls, isBlockedHost, isLogoOrIconImageUrl } from './photoValidation.ts';
import {
  CATEGORY_SIGNALS,
  DISCOVERY_CATEGORIES,
  buildDedupKey,
  classifyLeadName,
  detectCategories,
  detectClosedBusiness,
  domainOf,
  haversineMi,
  hostOf,
  leadHasSearchEvidence,
  normalizeAddress,
  normalizeCategory,
  normalizeName,
  normalizeWebsiteUrl,
} from './openaiDiscovery.ts';

export const VERIFIER_ID = 'openai_official_source_import';
export const COORDINATE_SOURCE = 'google_geocoding_official_address';
export const MAX_COORDINATE_DISAGREEMENT_MI = 2;
export const MAX_PHOTOS_PER_VENUE = 6;
export const MAX_PHOTO_CANDIDATES = 18;
export const MIN_IMAGE_BYTES = 8192;
// Venue photography is materially larger than an icon or logo asset.
export const MIN_VENUE_PHOTO_BYTES = 20000;

const CATEGORY_ENTITY_TYPE: Record<string, string> = {
  course: 'course',
  indoor_simulator: 'simulator',
  driving_range: 'golf_related_venue',
  golf_instruction: 'training',
  mini_golf: 'golf_related_venue',
  entertainment_golf: 'simulator',
  golf_retail_fitting: 'golf_related_venue',
};

export interface LeadEvaluationInput {
  lead: any;
  pageText: string;
  html?: string;
  sourceUrl: string;
  finalUrl: string;
  center: { lat: number; lng: number };
  radiusMi: number;
  existingListings: any[];
  // Google Geocoding result for the lead's address, including the
  // canonical postal code / street line the official page must confirm.
  geocoded?: {
    lat: number;
    lng: number;
    postal_code?: string;
    street_line?: string;
    formatted_address?: string;
  } | null;
  // URLs the OpenAI web search actually returned for this query.
  searchEvidenceUrls?: string[];
  jobId?: string;
  bookingUrl?: string;
  nowIso?: string;
  // Why the official page could not be read, when it could not.
  sourceError?: string;
  // Whether the lead's own coordinates must agree with the verified
  // address. Only meaningful when the lead supplied its own address.
  requireCoordinateAgreement?: boolean;
}

export interface LeadEvaluationResult {
  status: 'accepted' | 'pending' | 'rejected' | 'duplicate';
  reason: string;
  checks: { key: string; pass: boolean; reason: string }[];
  listing: any | null;
  coordinates: { lat: number; lng: number } | null;
  distanceMiles: number | null;
  dedupKey: string;
  discoveryCategory: string;
  corroboration: any | null;
}

function isFiniteNumber(v: any): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function findExistingDuplicate(
  candidate: { name?: string; address?: string; website?: string; city?: string; coords?: { lat: number; lng: number } | null },
  existingListings: any[]
): { isDuplicate: boolean; reason: string } {
  const candDomain = domainOf(candidate.website || '');
  const candName = normalizeName(candidate.name || '');
  const candAddr = normalizeAddress(candidate.address || '');
  const candCity = String(candidate.city || '').trim().toLowerCase();
  const coords = candidate.coords;

  for (const existing of existingListings || []) {
    if (!existing) continue;

    if (candDomain) {
      const d = domainOf(existing.official_domain || existing.official_website || existing.website || '');
      if (d && d === candDomain) return { isDuplicate: true, reason: 'same official domain' };
    }

    if (candName && candName === normalizeName(existing.name) && candCity && candCity === String(existing.city || '').toLowerCase()) {
      return { isDuplicate: true, reason: 'same normalized name and city' };
    }

    if (candAddr && candAddr === normalizeAddress(existing.address || '')) {
      return { isDuplicate: true, reason: 'same address' };
    }

    if (
      coords && candName && candName === normalizeName(existing.name) &&
      isFiniteNumber(existing.latitude) && isFiniteNumber(existing.longitude)
    ) {
      const d = haversineMi(coords.lat, coords.lng, existing.latitude, existing.longitude);
      if (d < 0.1) return { isDuplicate: true, reason: 'same location and name' };
    }
  }

  return { isDuplicate: false, reason: '' };
}

function corroboratedPhone(leadPhone: any, pageText: string): string {
  const digits = String(leadPhone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  const last4 = digits.slice(-4);
  return String(pageText || '').replace(/\D/g, '').includes(last4) ? String(leadPhone).trim() : '';
}

const STREET_STOP_WORDS = new Set([
  'street', 'avenue', 'road', 'drive', 'boulevard', 'lane', 'highway', 'suite',
  'north', 'south', 'east', 'west', 'parkway', 'court', 'circle', 'place',
  'trail', 'texas', 'oklahoma', 'united', 'states', 'county',
]);

function streetTokens(address: string): { number: string; words: string[] } {
  const raw = String(address || '');
  const numMatch = raw.match(/\b(\d{2,6})\b/);
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^\d+$/.test(w) && !STREET_STOP_WORDS.has(w));
  return { number: numMatch ? numMatch[1] : '', words };
}

// The official page must confirm the SPECIFIC address used for geocoding:
// either the canonical postal code, or the street number plus its street
// name. A city-only match is never sufficient.
export function addressConfirmedOnPage(
  pageText: string,
  geocoded: any,
  leadAddress: string
): { confirmed: boolean; method: string; detail: string } {
  const page = String(pageText || '').toLowerCase();

  const zip =
    String(geocoded?.postal_code || '').match(/\b(\d{5})\b/)?.[1] ||
    String(leadAddress || '').match(/\b(\d{5})\b/)?.[1] ||
    '';
  if (zip && page.includes(zip)) {
    return { confirmed: true, method: 'postal_code', detail: `official page shows postal code ${zip}` };
  }

  const addressSource = geocoded?.street_line || leadAddress || '';
  const { number, words } = streetTokens(addressSource);
  if (number && words.length > 0 && page.includes(number)) {
    const matched = words.filter((w) => page.includes(w));
    if (matched.length >= Math.ceil(words.length * 0.5)) {
      return {
        confirmed: true,
        method: 'street_address',
        detail: `official page shows street number ${number} and ${matched.length}/${words.length} street-name tokens`,
      };
    }
  }

  return {
    confirmed: false,
    method: 'none',
    detail: zip || number
      ? `official page shows neither postal code ${zip || '(none)'} nor street address "${addressSource}"`
      : 'no geocodable address or postal code was available to confirm',
  };
}

// Find a same-site contact / directions / visit page. Club home pages
// frequently list no address while their contact page does.
export function findContactPageUrl(html: string, officialUrl: string): string {
  if (!html || !officialUrl) return '';
  const officialHost = hostOf(officialUrl);
  if (!officialHost) return '';

  const anchorRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const label = String(m[2] || '').replace(/<[^>]+>/g, ' ').toLowerCase();
    if (!/contact|direction|location|visit|find\s*us|about/.test(`${href.toLowerCase()} ${label}`)) continue;
    let abs: string;
    try {
      abs = new URL(href, officialUrl).href;
    } catch {
      continue;
    }
    const host = hostOf(abs);
    if (host === officialHost || host.endsWith(`.${officialHost}`)) return abs;
  }
  return '';
}

// Find an official booking/tee-time link on the same site. A
// third-party booking host is not accepted as an official URL here.
export function extractOfficialBookingUrl(html: string, officialUrl: string): string {
  if (!html || !officialUrl) return '';
  const officialHost = hostOf(officialUrl);
  if (!officialHost) return '';

  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const label = String(m[2] || '').replace(/<[^>]+>/g, ' ').toLowerCase();
    if (!/book|tee\s*time|reserve|reservation|schedule/.test(`${href.toLowerCase()} ${label}`)) continue;
    let abs: string;
    try {
      abs = new URL(href, officialUrl).href;
    } catch {
      continue;
    }
    const host = hostOf(abs);
    if (host === officialHost || host.endsWith(`.${officialHost}`)) return abs;
  }
  return '';
}

export function buildApprovedListingRecord(input: {
  name: string;
  category: string;
  city: string;
  state: string;
  address: string;
  website: string;
  phone: string;
  coords: { lat: number; lng: number };
  bookingUrl?: string;
  jobId?: string;
  nowIso?: string;
}): any {
  const now = input.nowIso || new Date().toISOString();
  const category = normalizeCategory(input.category);
  const type = CATEGORY_ENTITY_TYPE[category] || 'golf_related_venue';

  return {
    name: input.name,
    type,
    venue_name: input.name,
    city: input.city || '',
    state: input.state || '',
    address: input.address || '',
    latitude: input.coords.lat,
    longitude: input.coords.lng,
    phone: input.phone || '',
    website: input.website,
    official_website: input.website,
    official_domain: domainOf(input.website),
    discovery_category: category,
    booking_url: input.bookingUrl || '',
    hours: '',
    description: '',
    photos: [],
    rating: null,
    status: 'approved',
    source_url: input.website,
    source_type: 'official_website',
    verification_tier: 2,
    verification_notes: `Official-source import: venue identity and category corroborated on ${domainOf(input.website)}; coordinates resolved via ${COORDINATE_SOURCE}`,
    verified_at: now,
    verified_by: VERIFIER_ID,
    golf_verified: true,
    golf_verified_at: now,
    golf_verified_by: VERIFIER_ID,
    photo_verified: false,
    is_professional_tournament: false,
    claim_status: 'unclaimed',
    ingestion_source: 'openai_web_search',
    ingestion_job_id: input.jobId || '',
    source_urls_considered: input.website,
  };
}

export function evaluateLead(input: LeadEvaluationInput): LeadEvaluationResult {
  const checks: { key: string; pass: boolean; reason: string }[] = [];
  const add = (key: string, pass: boolean, reason = '') => {
    checks.push({ key, pass: !!pass, reason: pass ? '' : reason });
    return !!pass;
  };

  const lead = input.lead || {};
  const name = typeof lead.name === 'string' ? lead.name.trim() : '';
  const center = input.center;
  const radius = Math.min(Math.max(Number(input.radiusMi) || 30, 1), 30);
  // Resolved later from the OFFICIAL PAGE text only — never from the
  // model's claim alone, and never from the venue name.
  let category = normalizeCategory(lead.category);
  const website = normalizeWebsiteUrl(lead.website);

  const coords =
    input.geocoded && isFiniteNumber(input.geocoded.lat) && isFiniteNumber(input.geocoded.lng)
      ? { lat: input.geocoded.lat, lng: input.geocoded.lng }
      : null;

  const dedupKey = buildDedupKey({
    name,
    address: lead.address,
    website,
    coords,
  });

  const deny = (
    status: LeadEvaluationResult['status'],
    reason: string,
    extra?: { corroboration?: any; distance?: number | null }
  ): LeadEvaluationResult => ({
    status,
    reason,
    checks,
    listing: null,
    coordinates: coords,
    distanceMiles: extra?.distance != null ? round1(extra.distance) : null,
    dedupKey,
    discoveryCategory: category,
    corroboration: extra?.corroboration || null,
  });

  if (!add('name_present', name.length > 0, 'missing venue name')) {
    return deny('rejected', 'missing venue name');
  }

  const nameClass = classifyLeadName(name);
  if (!add('golf_business', !nameClass.excluded, nameClass.reason)) {
    return deny('rejected', nameClass.reason);
  }

  if (!website || !isTrustedSourceUrl(website) || isBlockedHost(website)) {
    add('official_website_supported', false, 'no supported official venue website');
    return deny('pending', 'no supported official venue website');
  }
  add('official_website_supported', true);

  const corroboration = evaluateCorroboration(input.pageText, hostOf(input.sourceUrl), hostOf(input.finalUrl), {
    name,
    city: lead.city,
    address: lead.address,
    phone: lead.phone,
  });
  const corroborationReason = input.sourceError
    ? `official site could not be read: ${input.sourceError}`
    : `official page did not corroborate venue: ${corroboration.reason}`;
  if (!add('source_corroborated', corroboration.corroborated, corroborationReason)) {
    return deny('pending', corroborationReason, { corroboration });
  }

  // The lead must originate from a real web search that actually surfaced
  // this venue's official site. A model-invented lead cannot pass this.
  const searchEvidence = leadHasSearchEvidence(lead, input.searchEvidenceUrls || []);
  if (!add('search_evidence', searchEvidence.matched, searchEvidence.reason)) {
    return deny('pending', `no web-search evidence: ${searchEvidence.reason}`, { corroboration });
  }

  // Identity: the venue name must appear on its own official page.
  if (!add('venue_identity_confirmed', corroboration.evidence?.nameMatch === true, 'official page does not name this venue')) {
    return deny('pending', 'official page does not name this venue', { corroboration });
  }

  // Location: the page must confirm the exact address or postal code used
  // for geocoding. A city match alone is never sufficient.
  const addr = addressConfirmedOnPage(input.pageText, input.geocoded, lead.address);
  if (!add('address_confirmed', addr.confirmed, addr.detail)) {
    return deny('pending', `official page does not confirm the address: ${addr.detail}`, { corroboration });
  }

  // Category must be established by the official page text alone. The
  // model's category claim may only disambiguate between categories the
  // page itself supports; the venue name is never category evidence.
  const pageDetected = detectCategories(input.pageText);
  if (pageDetected.size === 0) {
    add('category_verified', false, 'official page does not establish a golf category');
    return deny('pending', 'official page does not establish a golf category', { corroboration });
  }
  const claimed = normalizeCategory(lead.category);
  const supported = Array.from(pageDetected).sort().join(', ');

  if (claimed && !pageDetected.has(claimed)) {
    // The lead's category claim is not supported by its own page: treat as
    // a source disagreement rather than re-labelling the venue silently.
    add('category_verified', false, `official page does not support the claimed category ${claimed} (page supports: ${supported})`);
    return deny('pending', `official page does not support the claimed category ${claimed} (page supports: ${supported})`, { corroboration });
  }
  if (claimed) {
    category = claimed;
  } else if (pageDetected.size === 1) {
    category = Array.from(pageDetected)[0];
  } else {
    add('category_verified', false, `category ambiguous on official page (${supported})`);
    return deny('pending', `category ambiguous on official page (${supported})`, { corroboration });
  }
  add('category_verified', true);

  // A closed venue must never be published, whatever else passed.
  const closedSignal = detectClosedBusiness(input.pageText);
  if (!add('operational', !closedSignal, closedSignal || 'venue appears open')) {
    return deny('rejected', closedSignal, { corroboration });
  }

  if (!coords) {
    add('coordinates_verified', false, 'coordinates could not be corroborated from an official address');
    return deny('pending', 'coordinates could not be corroborated from an official address', { corroboration });
  }
  add('coordinates_verified', true);

  const leadHasCoords = isFiniteNumber(lead.latitude) && isFiniteNumber(lead.longitude);
  // Agreement is only meaningful when the lead supplied its own address:
  // then the address and the coordinates are two independent facts. A
  // coordinate the model guessed is not evidence against an address the
  // official page confirms, so it cannot veto the venue.
  if (leadHasCoords && input.requireCoordinateAgreement !== false) {
    const disagreement = haversineMi(lead.latitude, lead.longitude, coords.lat, coords.lng);
    if (!add('coordinate_agreement', disagreement <= MAX_COORDINATE_DISAGREEMENT_MI,
      `source disagreement: model coordinates differ from verified address by ${round1(disagreement)} mi`)) {
      return deny('pending',
        `source disagreement: model coordinates differ from verified address by ${round1(disagreement)} mi`,
        { corroboration });
    }
  } else {
    add('coordinate_agreement', true);
  }

  const distance = haversineMi(center.lat, center.lng, coords.lat, coords.lng);
  if (!add('within_import_radius', distance <= radius, `out of import radius: ${round1(distance)} mi > ${radius} mi`)) {
    return deny('rejected', `out of import radius: ${round1(distance)} mi > ${radius} mi`, {
      corroboration,
      distance,
    });
  }

  const duplicate = findExistingDuplicate(
    { name, address: lead.address, website, city: lead.city, coords },
    input.existingListings
  );
  if (!add('not_duplicate', !duplicate.isDuplicate, `already listed: ${duplicate.reason}`)) {
    return deny('duplicate', `already listed: ${duplicate.reason}`, { corroboration, distance });
  }

  const listing = buildApprovedListingRecord({
    name,
    category,
    city: lead.city,
    state: lead.state,
    address: lead.address,
    website,
    phone: corroboratedPhone(lead.phone, input.pageText),
    coords,
    bookingUrl: input.bookingUrl,
    jobId: input.jobId,
    nowIso: input.nowIso,
  });

  const policy = checkPublicListing(listing, center.lat, center.lng, radius);
  if (!add('public_listing_policy', policy.pass, `public listing policy rejected: ${policy.firstFailingReason}`)) {
    return deny('pending', `public listing policy rejected: ${policy.firstFailingReason}`, {
      corroboration,
      distance,
    });
  }

  return {
    status: 'accepted',
    reason: 'all official-source checks and the public listing policy passed',
    checks,
    listing,
    coordinates: coords,
    distanceMiles: round1(distance),
    dedupKey,
    discoveryCategory: category,
    corroboration,
  };
}

// ------------------------------------------------------------
// Official photos — deterministic only (no LLM). A photo is
// accepted only when it is referenced by the already-verified
// official page, is a real image, and is not a blocked host.
// Photo verification is deliberately separate from listing
// verification.
// ------------------------------------------------------------
export async function verifyOfficialPhoto(
  imageUrl: string,
  officialPageUrl: string
): Promise<{ accepted: boolean; reason: string; photo_url: string; source_url: string; attribution: string }> {
  const reject = (reason: string) => ({
    accepted: false,
    reason,
    photo_url: imageUrl,
    source_url: officialPageUrl,
    attribution: '',
  });

  // Every hop (initial URL and each redirect) is validated with the same
  // public-URL/SSRF rules used for official-page fetches. Any unsafe or
  // unverifiable hop rejects the photo.
  const checked = await checkImageUrl(imageUrl, 'HEAD');
  if (!checked.ok) return reject(checked.reason);

  // Logos, icons, sprites and thumbnails are not venue photography.
  const logoProblem = isLogoOrIconImageUrl(checked.finalUrl || imageUrl);
  if (logoProblem) return reject(logoProblem);

  if (checked.contentLength > 0 && checked.contentLength < MIN_VENUE_PHOTO_BYTES) {
    return reject(`image too small for venue photography (${checked.contentLength} bytes)`);
  }

  const host = hostOf(officialPageUrl);
  return {
    accepted: true,
    reason: 'referenced by the verified official page',
    photo_url: checked.finalUrl || imageUrl,
    source_url: officialPageUrl,
    attribution: `Official venue photo — ${host}`,
  };
}

export async function collectVerifiedPhotos(
  html: string,
  officialPageUrl: string
): Promise<{ accepted: any[]; rejected: any[] }> {
  const accepted: any[] = [];
  const rejected: any[] = [];
  if (!html) return { accepted, rejected };

  const candidates = extractImageUrls(html, officialPageUrl).slice(0, MAX_PHOTO_CANDIDATES);
  for (const url of candidates) {
    if (accepted.length >= MAX_PHOTOS_PER_VENUE) break;
    const result = await verifyOfficialPhoto(url, officialPageUrl);
    if (result.accepted) accepted.push(result);
    else rejected.push(result);
  }
  return { accepted, rejected };
}

export function categorySignalsFor(category: string): string[] {
  return CATEGORY_SIGNALS[category] || [];
}

export function entityTypeForCategory(category: string): string {
  return CATEGORY_ENTITY_TYPE[category] || 'golf_related_venue';
}

export function allDiscoveryCategories(): string[] {
  return DISCOVERY_CATEGORIES.map((c) => c.key);
}