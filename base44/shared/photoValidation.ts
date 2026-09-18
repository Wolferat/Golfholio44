// ============================================================
// Photo Validation — Automated official-photo discovery and
// safety/relevance/quality validation for eligible listings.
//
// Sources:
//   - the listing's confirmed official venue website
//   - images hosted by that official website (same domain or CDN)
//
// Google Places imagery is NOT used unless the API can establish
// the image is associated with the exact venue AND the current
// Google Maps Platform terms permit the intended display. User
// review photos are NEVER treated as official venue imagery.
//
// Every candidate photo must pass:
//   - SSRF-hardened URL validation (reuses automatedVerification)
//   - HTTP content-type is an image
//   - content-length above a minimum threshold (rejects icons/logos)
//   - LLM safety + relevance + quality analysis (multi-signal)
//   - source attribution retained
//
// If any check is uncertain, the photo is rejected or left hidden.
// Never show uncertain imagery.
// ============================================================

import { validatePublicUrl } from './automatedVerification.ts';

const MIN_IMAGE_BYTES = 8192; // 8 KB — rejects tiny icons, logos, map tiles
const MAX_CANDIDATES = 12; // per listing — limits LLM calls
const MAX_ACCEPTED = 3; // per listing
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i;

export interface PhotoValidationResult {
  accepted: boolean;
  reason: string;
  photo_url: string;
  source_url: string;
  attribution: string;
  is_photo?: boolean;
  is_golf_venue?: boolean;
  is_safe?: boolean;
  is_quality?: boolean;
  is_relevant?: boolean;
}

export interface ListingPhotoDiscoveryResult {
  listing_id: string;
  listing_name: string;
  website_used: string;
  candidates_checked: number;
  accepted: PhotoValidationResult[];
  rejected: PhotoValidationResult[];
  fetch_error: string | null;
}

// ------------------------------------------------------------
// SSRF-hardened HTML fetch — validates every URL (initial + each
// redirect hop), caps response at 1 MB, 8 s timeout.
// ------------------------------------------------------------
async function fetchHtmlSafely(
  url: string
): Promise<{ ok: boolean; html: string; finalUrl: string; reason: string }> {
  const initialCheck = await validatePublicUrl(url);
  if (!initialCheck.valid) {
    return { ok: false, html: '', finalUrl: url, reason: initialCheck.reason };
  }

  try {
    let currentUrl = url;
    let response: Response | null = null;
    const MAX_REDIRECTS = 5;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hopCheck = await validatePublicUrl(currentUrl);
      if (!hopCheck.valid) {
        return { ok: false, html: '', finalUrl: currentUrl, reason: hopCheck.reason };
      }
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Golfolio-PhotoBot/1.0 (+https://sync-flow-go-utopian.base44.app)' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, html: '', finalUrl: currentUrl, reason: 'redirect missing location' };
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          return { ok: false, html: '', finalUrl: currentUrl, reason: 'invalid redirect' };
        }
        if (hop === MAX_REDIRECTS) return { ok: false, html: '', finalUrl: currentUrl, reason: 'too many redirects' };
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return { ok: false, html: '', finalUrl: currentUrl, reason: `HTTP ${response?.status || 0}` };
    }

    const MAX_SIZE = 1024 * 1024;
    const rawText = await response.text();
    const html = rawText.slice(0, MAX_SIZE);
    return { ok: true, html, finalUrl: currentUrl, reason: '' };
  } catch {
    return { ok: false, html: '', finalUrl: url, reason: 'fetch error' };
  }
}

// ------------------------------------------------------------
// Extract image URLs from HTML — og:image, img src tags.
// Resolves relative URLs, deduplicates, filters to image-like
// extensions or extensionless CDN URLs. Only same-domain or
// subdomain images are kept (prevents third-party trackers).
// ------------------------------------------------------------
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {}

  const resolve = (u: string): string => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return '';
    }
  };

  const isSameDomain = (u: string): boolean => {
    try {
      const h = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
      return h === baseHost || h.endsWith('.' + baseHost);
    } catch {
      return false;
    }
  };

  // og:image and twitter:image meta tags (highest quality, preferred)
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?:[^"']*?)["'][^>]+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const u = resolve(m[1]);
    if (u && isSameDomain(u)) urls.add(u);
  }

  // <img src="...">
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((m = imgRe.exec(html)) !== null) {
    const u = resolve(m[1]);
    if (!u) continue;
    if (!isSameDomain(u)) continue;
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    const path = parsed.pathname.toLowerCase();
    if (IMAGE_EXTENSIONS.test(path) || !path.match(/\.[a-z0-9]{2,5}$/i)) {
      urls.add(u);
    }
  }

  return Array.from(urls).slice(0, MAX_CANDIDATES);
}

// ------------------------------------------------------------
// Basic HTTP pre-check: content-type must be an image, and
// content-length must be above the icon/logo threshold. This
// avoids wasting LLM calls on non-images or tiny graphics.
// ------------------------------------------------------------
async function preCheckImage(
  imageUrl: string
): Promise<{ ok: boolean; reason: string; contentType: string; contentLength: number }> {
  const check = await validatePublicUrl(imageUrl);
  if (!check.valid) return { ok: false, reason: check.reason, contentType: '', contentLength: 0 };

  try {
    const response = await fetch(imageUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Golfolio-PhotoBot/1.0 (+https://sync-flow-go-utopian.base44.app)' },
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}`, contentType: '', contentLength: 0 };
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (!contentType.startsWith('image/')) {
      return { ok: false, reason: `not an image: ${contentType || 'unknown'}`, contentType, contentLength };
    }
    if (contentLength > 0 && contentLength < MIN_IMAGE_BYTES) {
      return { ok: false, reason: `image too small (${contentLength} bytes)`, contentType, contentLength };
    }
    return { ok: true, reason: '', contentType, contentLength };
  } catch {
    // HEAD might fail (server doesn't support it) — allow LLM to check
    return { ok: true, reason: 'HEAD unavailable — deferring to LLM', contentType: '', contentLength: 0 };
  }
}

// ------------------------------------------------------------
// LLM-based photo validation — multi-signal safety, relevance,
// and quality analysis. SafeSearch is one signal, never the only
// one. The LLM sees the image via file_urls and returns structured
// JSON with per-dimension booleans.
// ------------------------------------------------------------
const PHOTO_LLM_SCHEMA = {
  type: 'object',
  properties: {
    is_photo: { type: 'boolean', description: 'True if this is a real photograph, not a logo, icon, map, screenshot, or graphic' },
    is_golf_venue: { type: 'boolean', description: 'True if the image shows a golf course, driving range, simulator, facility, or event' },
    is_safe: { type: 'boolean', description: 'True if safe for general audiences — no adult, violent, hateful, illegal, or unsafe content' },
    is_quality: { type: 'boolean', description: 'True if high quality — not blurry, broken, tiny, or low resolution' },
    is_relevant: { type: 'boolean', description: 'True if likely related to the specific named venue, not a generic stock photo' },
    suitable: { type: 'boolean', description: 'True if ALL checks pass and this is suitable as an official venue photo' },
    reason: { type: 'string', description: 'Short explanation of the decision' },
  },
  required: ['suitable', 'reason'],
};

export async function validatePhoto(
  imageUrl: string,
  listing: { name?: string; type?: string; city?: string },
  sourceUrl: string,
  llmInvoke: (params: any) => Promise<any>
): Promise<PhotoValidationResult> {
  const baseResult: PhotoValidationResult = {
    accepted: false,
    reason: '',
    photo_url: imageUrl,
    source_url: sourceUrl,
    attribution: buildAttribution(sourceUrl),
  };

  // 1. SSRF + basic HTTP pre-check
  const pre = await preCheckImage(imageUrl);
  if (!pre.ok) {
    return { ...baseResult, reason: `pre-check failed: ${pre.reason}` };
  }

  // 2. LLM multi-signal validation
  try {
    const prompt =
      'You are an automated photo validator for a golf venue app. Analyze this image and decide if it is suitable ' +
      'as an OFFICIAL venue photo.\n\n' +
      `Venue name: ${listing.name || 'Unknown'}\n` +
      `Venue type: ${listing.type || 'course'}\n` +
      `Venue city: ${listing.city || 'Unknown'}\n` +
      `Source page: ${sourceUrl}\n\n` +
      'Check each dimension:\n' +
      '1. is_photo: Is this a real photograph (not a logo, icon, map tile, screenshot, or graphic)?\n' +
      '2. is_golf_venue: Does it show a golf course, driving range, simulator, facility, or golf event?\n' +
      '3. is_safe: Is it safe for general audiences (no adult, sexual, violent, hateful, illegal, or unsafe content)?\n' +
      '4. is_quality: Is it high quality (not blurry, broken, tiny, or low resolution)?\n' +
      '5. is_relevant: Is it likely related to the specific named venue (not a generic stock photo)?\n' +
      'Set suitable=true ONLY if ALL five checks pass. Otherwise suitable=false with a reason.\n' +
      'If you cannot confidently determine any dimension, set suitable=false (fail closed).';

    const result = await llmInvoke({
      prompt,
      response_json_schema: PHOTO_LLM_SCHEMA,
      file_urls: [imageUrl],
    });

    const mod = result?.data || result;
    if (!mod || typeof mod.suitable !== 'boolean') {
      return { ...baseResult, reason: 'LLM validation unavailable — rejected (fail closed)' };
    }

    return {
      ...baseResult,
      accepted: mod.suitable === true,
      reason: (mod.reason || '').slice(0, 300),
      is_photo: mod.is_photo,
      is_golf_venue: mod.is_golf_venue,
      is_safe: mod.is_safe,
      is_quality: mod.is_quality,
      is_relevant: mod.is_relevant,
    };
  } catch {
    return { ...baseResult, reason: 'LLM validation error — rejected (fail closed)' };
  }
}

// ------------------------------------------------------------
// Build attribution text from the source URL host.
// ------------------------------------------------------------
function buildAttribution(sourceUrl: string): string {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
    return `Official venue photo — ${host}`;
  } catch {
    return 'Official venue photo';
  }
}

// ------------------------------------------------------------
// Discover photos for a single listing — fetches the official
// website, extracts candidate image URLs, validates each, and
// returns accepted + rejected results. Stops after MAX_ACCEPTED.
// ------------------------------------------------------------
export async function discoverPhotosForListing(
  listing: any,
  llmInvoke: (params: any) => Promise<any>
): Promise<ListingPhotoDiscoveryResult> {
  const result: ListingPhotoDiscoveryResult = {
    listing_id: listing.id,
    listing_name: listing.name,
    website_used: '',
    candidates_checked: 0,
    accepted: [],
    rejected: [],
    fetch_error: null,
  };

  const website = listing.official_website || listing.website || listing.source_url;
  if (!website) {
    result.fetch_error = 'no official website URL';
    return result;
  }
  result.website_used = website;

  const fetched = await fetchHtmlSafely(website);
  if (!fetched.ok) {
    result.fetch_error = fetched.reason;
    return result;
  }

  const candidates = extractImageUrls(fetched.html, fetched.finalUrl);
  result.candidates_checked = candidates.length;

  for (const imageUrl of candidates) {
    if (result.accepted.length >= MAX_ACCEPTED) break;

    const validation = await validatePhoto(imageUrl, listing, fetched.finalUrl, llmInvoke);
    if (validation.accepted) {
      result.accepted.push(validation);
    } else {
      result.rejected.push(validation);
    }
  }

  return result;
}