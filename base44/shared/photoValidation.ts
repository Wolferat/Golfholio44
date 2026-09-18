// ============================================================
// Photo Validation — Automated official-photo discovery and
// safety/relevance/quality validation for eligible listings.
//
// Sources (STRICT — no generic website field):
//   - the listing's confirmed official_website, OR
//   - the confirmed source_url that passed the full listing
//     verification contract (only when source_type is an
//     allowed official/trusted type — never google_places or
//     google_business_profile)
//
// A generic Google/Places website candidate, directory URL,
// social URL, inferred URL, or unverified field is NEVER used.
//
// CDN images: an image host does NOT need to match the official
// website host. A CDN image is allowed when it is directly
// referenced by the already-validated official venue/source
// page and passes all safety/relevance/quality checks. Known
// third-party tracker/directory/social/ad/stock hosts are
// blocked at the URL level.
//
// Google Places imagery is NOT used. User review photos are
// NEVER treated as official venue imagery.
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

// source_types that indicate source_url is a confirmed official
// source (not a generic Google Places or directory listing).
const ALLOWED_SOURCE_TYPES = new Set([
  'official_website',
  'event_website',
  'trusted_organization',
  'admin',
]);

// Known third-party hosts that must never produce official photos.
// Includes social, directories, Google user content/Places photos,
// ad networks, stock photo sites, and analytics/trackers.
const BLOCKED_HOSTS = [
  // Social
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'linkedin.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
  // Directories / review sites
  'yelp.com', 'tripadvisor.com', 'foursquare.com', 'yellowpages.com',
  'bbb.org', 'opentable.com', 'angieslist.com', 'hotels.com',
  'booking.com', 'expedia.com', 'airbnb.com',
  // Google user content / Places photos
  'google.com', 'googleusercontent.com', 'ggpht.com', 'lh3.googleusercontent.com',
  'maps.googleapis.com', 'maps.google.com',
  // Ad networks / trackers
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
  'googletagmanager.com', 'googletagservices.com',
  'adnxs.com', 'criteo.com', 'taboola.com', 'outbrain.com',
  // Stock photo sites
  'shutterstock.com', 'gettyimages.com', 'istockphoto.com', 'alamy.com',
  'pexels.com', 'unsplash.com', 'pixabay.com', 'depositphotos.com',
  'dreamstime.com', 'stock.adobe.com',
  // Analytics
  'google-analytics.com', 'segment.io', 'mixpanel.com', 'amplitude.com',
  'hotjar.com', 'fullstory.com',
];

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
// Select the official source URL for photo discovery.
// Returns the confirmed official_website, or the confirmed
// source_url when source_type is an allowed official/trusted
// type. NEVER returns the generic website field. Returns empty
// string when no valid official source is available.
// ------------------------------------------------------------
export function selectOfficialSource(listing: any): string {
  if (listing.official_website) {
    return String(listing.official_website).trim();
  }
  if (listing.source_url && ALLOWED_SOURCE_TYPES.has(listing.source_type)) {
    return String(listing.source_url).trim();
  }
  return '';
}

// ------------------------------------------------------------
// Check if a URL host is a known third-party tracker, directory,
// social, ad, stock, or Google Places host. These are blocked
// at the URL level — they can never produce official photos.
// ------------------------------------------------------------
export function isBlockedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
  } catch {
    return true; // invalid URL = blocked
  }
}

// ------------------------------------------------------------
// Validate a review photo URI — must be a private file URI from
// our controlled storage, never an external URL.
// ------------------------------------------------------------
export function isValidReviewPhotoUri(photoUri: string): boolean {
  if (!photoUri) return true; // empty is valid (no photo)
  const trimmed = photoUri.trim();
  // Reject any http/https URL — review photos must come from
  // controlled UploadPrivateFile storage, not external URLs.
  if (/^https?:\/\//i.test(trimmed)) return false;
  // Reject other URL schemes
  if (/^(ftp|file|javascript|data):/i.test(trimmed)) return false;
  return true;
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
// extensions or extensionless CDN URLs.
//
// CDN images ARE allowed: the image host does NOT need to match
// the official website host. A CDN image (Wix, Squarespace,
// Cloudflare, CloudFront, etc.) is kept when it is directly
// referenced by the validated official page.
//
// Known third-party tracker/directory/social/ad/stock hosts are
// blocked at the URL level.
// ------------------------------------------------------------
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();

  const resolve = (u: string): string => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return '';
    }
  };

  const isAllowedHost = (u: string): boolean => {
    return !isBlockedHost(u);
  };

  // og:image and twitter:image meta tags (highest quality, preferred)
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?:[^"']*?)["'][^>]+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const u = resolve(m[1]);
    if (u && isAllowedHost(u)) urls.add(u);
  }

  // <img src="...">
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((m = imgRe.exec(html)) !== null) {
    const u = resolve(m[1]);
    if (!u) continue;
    if (!isAllowedHost(u)) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      const path = parsed.pathname.toLowerCase();
      if (IMAGE_EXTENSIONS.test(path) || !path.match(/\.[a-z0-9]{2,5}$/i)) {
        urls.add(u);
      }
    } catch {}
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

  if (isBlockedHost(imageUrl)) {
    return { ok: false, reason: 'blocked host (third-party tracker/directory/social/ad/stock)', contentType: '', contentLength: 0 };
  }

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
// source page, extracts candidate image URLs, validates each,
// and returns accepted + rejected results. Stops after
// MAX_ACCEPTED.
//
// Source selection: only official_website or confirmed
// source_url (with allowed source_type). NEVER the generic
// website field.
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

  const sourceUrl = selectOfficialSource(listing);
  if (!sourceUrl) {
    result.fetch_error = 'no confirmed official source URL';
    return result;
  }
  result.website_used = sourceUrl;

  const fetched = await fetchHtmlSafely(sourceUrl);
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