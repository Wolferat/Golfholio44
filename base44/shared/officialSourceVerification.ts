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

import { evaluateCorroboration, validatePublicUrl } from './automatedVerification.ts';
import { checkPublicListing, isTrustedSourceUrl } from './publicListingPolicy.ts';
import { extractImageUrls, isBlockedHost } from './photoValidation.ts';
import {
  CATEGORY_SIGNALS,
  DISCOVERY_CATEGORIES,
  buildDedupKey,
  classifyLeadName,
  detectCategories,
  domainOf,
  haversineMi,
  hostOf,
  normalizeAddress,
  normalizeCategory,
  normalizeName,
  normalizeWebsiteUrl,
} from './openaiDiscovery.ts';

export const VERIFIER_ID = 'openai_official_source_import';
export const COORDINATE_SOURCE = 'google_geocoding_official_address';
export const MAX_COORDINATE_DISAGREEMENT_MI = 2;
export const MAX_PHOTOS_PER_VENUE = 3;
export const MAX_PHOTO_CANDIDATES = 10;
export const MIN_IMAGE_BYTES = 8192;

const CATEGORY_ENTITY_TYPE: Record<string, string> = {
  course: 'course',
  indoor_simulator: 'simulator',
  driving_range: 'golf_related_venue',
  golf_instruction: 'training',
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
  geocoded?: { lat: number; lng: number } | null;
  jobId?: string;
  bookingUrl?: string;
  nowIso?: string;
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
  const category = normalizeCategory(lead.category);
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
  if (!add('source_corroborated', corroboration.corroborated, `official page did not corroborate venue: ${corroboration.reason}`)) {
    return deny('pending', `official page did not corroborate venue: ${corroboration.reason}`, { corroboration });
  }

  if (!category) {
    add('category_verified', false, 'ambiguous category');
    return deny('pending', 'ambiguous category', { corroboration });
  }

  const detected = detectCategories(`${input.pageText} ${name}`);
  if (!add('category_verified', detected.has(category), `official page does not support category ${category}`)) {
    return deny('pending', `official page does not support category ${category}`, { corroboration });
  }

  if (!coords) {
    add('coordinates_verified', false, 'coordinates could not be corroborated from an official address');
    return deny('pending', 'coordinates could not be corroborated from an official address', { corroboration });
  }
  add('coordinates_verified', true);

  if (isFiniteNumber(lead.latitude) && isFiniteNumber(lead.longitude)) {
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

  if (isBlockedHost(imageUrl)) return reject('blocked image host (social/directory/stock/Google)');

  const urlCheck = await validatePublicUrl(imageUrl);
  if (!urlCheck.valid) return reject(urlCheck.reason);

  try {
    const res = await fetch(imageUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Golfolio-PhotoCheck/1.0 (+https://sync-flow-go-utopian.base44.app)' },
    });
    if (!res.ok) return reject(`HTTP ${res.status}`);

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return reject(`not an image: ${contentType || 'unknown'}`);

    const length = parseInt(res.headers.get('content-length') || '0', 10);
    if (length > 0 && length < MIN_IMAGE_BYTES) return reject(`image too small (${length} bytes)`);

    const host = hostOf(officialPageUrl);
    return {
      accepted: true,
      reason: 'referenced by the verified official page',
      photo_url: imageUrl,
      source_url: officialPageUrl,
      attribution: `Official venue photo — ${host}`,
    };
  } catch {
    return reject('image fetch failed');
  }
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