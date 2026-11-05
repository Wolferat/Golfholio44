// ============================================================
// Venue enrichment — one venue, two sources, one complete dossier.
//
// A lead arrives from EITHER a model web search (name + website, often a
// thin or missing address) or a Google Places search (perfect address and
// place_id, sometimes no website). Either direction alone leaves gaps, so
// every candidate is enriched from BOTH before any gate runs:
//
//   Google Business Profile  → place_id, canonical street address,
//                             postal code, phone, rating, review count
//   web search / lead        → the venue's own official website
//
// Places is used for identity and contact facts. It is never proof that
// a business is a golf venue — the official page still has to corroborate
// the venue before anything is published automatically.
// ============================================================

import { findPlaceAddress, golfEvidenceFromPlace, placeDetails } from './googlePlaces.ts';
import { isTrustedSourceUrl } from './publicListingPolicy.ts';
import { isBlockedHost } from './photoValidation.ts';
import {
  collectSearchEvidence,
  hostOf,
  normalizeWebsiteUrl,
} from './openaiDiscovery.ts';

// Bounded so a scan can never fan out into an unbounded number of paid
// web searches. Only venues with no website from either source use one.
export const MAX_WEBSITE_LOOKUPS_PER_SCAN = 3;

export interface PlaceProfile {
  place_id: string;
  name: string;
  formatted_address: string;
  city: string;
  state: string;
  postal_code: string;
  street_line: string;
  phone: string;
  // Google's own website field, exactly as returned (may be untrusted).
  listing_website: string;
  // The website only when it is a usable official source.
  website: string;
  rating: number | null;
  review_count: number | null;
  types: string[];
  lat: number | null;
  lng: number | null;
  // What the profile itself publishes (summary + reviews). Golf is often
  // run inside a business named for something else, so this text — not the
  // name — is the evidence that the venue is golf related.
  evidence_text: string;
  golf_evidence: boolean;
  golf_categories: string[];
  golf_reason: string;
}

function comp(components: any[], type: string, short = false): string {
  const c = (components || []).find((x: any) => (x.types || []).includes(type));
  if (!c) return '';
  return (short ? c.short_name : c.long_name) || '';
}

// A website only counts when it is a real venue site: no directory, review,
// social or aggregator host, and not a blocked image/data host.
export function usableWebsite(value: any): string {
  const url = normalizeWebsiteUrl(value);
  if (!url) return '';
  if (!isTrustedSourceUrl(url)) return '';
  if (isBlockedHost(url)) return '';
  return url;
}

export function sameSite(a: string, b: string): boolean {
  const ha = hostOf(a);
  const hb = hostOf(b);
  if (!ha || !hb) return false;
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

const NAME_STOPWORDS = new Set([
  'golf', 'club', 'the', 'of', 'and', 'llc', 'inc', 'course', 'courses',
  'center', 'centre', 'country', 'links', 'at', 'family', 'park',
]);

// Two names describe the same business when one contains the other, or
// when they share most of their distinctive words.
export function nameAgreement(a: string, b: string): boolean {
  const clean = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = clean(a);
  const nb = clean(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const tokens = (v: string) =>
    new Set(
      String(v || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !NAME_STOPWORDS.has(w))
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const shared = Array.from(ta).filter((w) => tb.has(w)).length;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}

export function houseNumber(address: string): string {
  const m = String(address || '').match(/^\s*(\d{1,6})\b/);
  return m ? m[1] : '';
}

export function postalCode(address: string): string {
  const m = String(address || '').match(/\b(\d{5})\b/);
  return m ? m[1] : '';
}

export function addressAgreement(a: string, b: string): boolean | null {
  const numA = houseNumber(a);
  const numB = houseNumber(b);
  if (numA && numB) return numA === numB;
  const zipA = postalCode(a);
  const zipB = postalCode(b);
  if (zipA && zipB) return zipA === zipB;
  return null;
}

function profileFrom(placeId: string, det: any): PlaceProfile {
  const components = det.address_components || [];
  const streetNumber = comp(components, 'street_number');
  const route = comp(components, 'route');
  const golf = golfEvidenceFromPlace(det);
  return {
    place_id: det.place_id || placeId,
    name: det.name || '',
    formatted_address: det.formatted_address || '',
    city: comp(components, 'locality') || comp(components, 'postal_town'),
    state: comp(components, 'administrative_area_level_1', true),
    postal_code: comp(components, 'postal_code', true),
    street_line: [streetNumber, route].filter(Boolean).join(' '),
    phone: det.formatted_phone_number || '',
    listing_website: det.website || '',
    website: usableWebsite(det.website),
    rating: typeof det.rating === 'number' ? det.rating : null,
    review_count: typeof det.user_ratings_total === 'number' ? det.user_ratings_total : null,
    types: Array.isArray(det.types) ? det.types : [],
    lat: typeof det.geometry?.location?.lat === 'number' ? det.geometry.location.lat : null,
    lng: typeof det.geometry?.location?.lng === 'number' ? det.geometry.location.lng : null,
    evidence_text: golf.text,
    golf_evidence: golf.isGolf,
    golf_categories: golf.categories,
    golf_reason: golf.reason,
  };
}

// Resolve the Google Business Profile for a venue: by place_id when we
// already have one, otherwise by name + city + state.
export async function resolvePlaceProfile(input: {
  placesKey?: string;
  placeId?: string;
  name?: string;
  city?: string;
  state?: string;
}): Promise<PlaceProfile | null> {
  const key = String(input.placesKey || '').trim();
  if (!key) return null;

  let placeId = String(input.placeId || '').trim();
  if (!placeId) {
    const name = String(input.name || '').trim();
    if (!name) return null;
    const found = await findPlaceAddress(key, name, input.city, input.state).catch(() => null);
    placeId = String(found?.place_id || '').trim();
  }
  if (!placeId) return null;

  const det = await placeDetails(key, placeId).catch(() => null);
  if (!det) return null;
  return profileFrom(placeId, det);
}

// ------------------------------------------------------------
// The other direction: a venue Google knows but that has no website on
// its profile. One targeted web search asks for the venue's own site.
// The answer is accepted only when the URL actually appeared in the
// search results, so it can never be a made-up domain.
// ------------------------------------------------------------
const WEBSITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { website: { type: 'string' } },
  required: ['website'],
};

function outputText(data: any): string {
  let text = '';
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
    }
  }
  if (!text && typeof data?.output_text === 'string') text = data.output_text;
  return text;
}

export async function findOfficialWebsiteBySearch(
  apiKey: string,
  input: { name: string; city?: string; state?: string },
  timeoutMs = 30000
): Promise<{ website: string; urls: string[]; reason: string }> {
  const name = String(input.name || '').trim();
  if (!apiKey || !name) return { website: '', urls: [], reason: 'missing inputs' };

  const where = [input.city, input.state].filter(Boolean).join(', ');
  const body = {
    model: 'gpt-4.1-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: { type: 'web_search' },
    include: ['web_search_call.action.sources'],
    input: [
      `Find the official website of the golf venue "${name}"${where ? ` in ${where}` : ''}.`,
      'Return the venue\'s own official site only.',
      'Never return a directory, review site, golf aggregator, tee-time marketplace, social media page, or Google Maps link.',
      'If the venue has no website of its own, return an empty string.',
    ].join(' '),
    text: {
      format: { type: 'json_schema', name: 'official_website', strict: true, schema: WEBSITE_SCHEMA },
    },
  };

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { website: '', urls: [], reason: `openai http ${res.status}` };

    const data = await res.json().catch(() => null);
    const { urls } = collectSearchEvidence(data);
    const text = outputText(data);
    if (!text.trim()) return { website: '', urls, reason: 'no output text' };

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return { website: '', urls, reason: 'malformed json output' };
    }

    const candidate = usableWebsite(parsed?.website);
    if (!candidate) return { website: '', urls, reason: 'no usable official website returned' };
    if (!urls.some((u) => sameSite(u, candidate))) {
      return { website: '', urls, reason: 'website not confirmed by the search results' };
    }
    return { website: candidate, urls, reason: '' };
  } catch (e: any) {
    return { website: '', urls: [], reason: `request failed: ${String(e?.name || 'error')}` };
  }
}

export interface VenueEnrichment {
  place: PlaceProfile | null;
  // The official website that will be fetched and attributed, and where it
  // came from.
  website: string;
  website_source: 'lead' | 'places' | 'web_search' | '';
  // True when a paid web search was spent on this venue.
  searched: boolean;
  // Plain-language disagreements between the two sources. Shown to the
  // admin, never to players.
  conflicts: string[];
}

export async function enrichVenue(input: {
  placesKey?: string;
  openaiKey?: string;
  allowWebsiteSearch?: boolean;
  placeId?: string;
  name: string;
  city?: string;
  state?: string;
  address?: string;
  website?: string;
}): Promise<VenueEnrichment> {
  const leadWebsite = usableWebsite(input.website);
  const place = await resolvePlaceProfile({
    placesKey: input.placesKey,
    placeId: input.placeId,
    name: input.name,
    city: input.city,
    state: input.state,
  }).catch(() => null);

  let website = leadWebsite || place?.website || '';
  let websiteSource: VenueEnrichment['website_source'] = leadWebsite
    ? 'lead'
    : place?.website
      ? 'places'
      : '';
  let searched = false;

  if (!website && input.allowWebsiteSearch && input.openaiKey) {
    searched = true;
    const found = await findOfficialWebsiteBySearch(input.openaiKey, {
      name: input.name,
      city: input.city,
      state: input.state,
    });
    if (found.website) {
      website = found.website;
      websiteSource = 'web_search';
    }
  }

  const conflicts: string[] = [];
  if (place && place.name && input.name && !nameAgreement(place.name, input.name)) {
    conflicts.push(`Google lists this business as "${place.name}"`);
  }
  if (leadWebsite && place?.listing_website && !sameSite(leadWebsite, place.listing_website)) {
    conflicts.push(`Google lists a different website: ${place.listing_website}`);
  }
  if (place && input.address) {
    const agree = addressAgreement(input.address, place.formatted_address);
    if (agree === false) {
      conflicts.push(`Google's address differs: ${place.formatted_address}`);
    }
  }

  return { place, website, website_source: websiteSource, searched, conflicts };
}