// ============================================================
// Automated Verification — Deterministic evidence validation +
// source page corroboration + SSRF-hardened fetching.
//
// The LLM may research and classify evidence, but it must NOT be
// the sole authority approving a public listing. Every approval
// requires independently validated evidence:
//   - golf-related (LLM research, corroborated by name pattern)
//   - category allowed (deterministic)
//   - source URL official/authoritative (deterministic, NOT LLM)
//   - source uses valid http/https (deterministic)
//   - source PAGE corroborates venue/event identity (deterministic
//     fetch + text match — NOT just a clean-looking domain)
//   - coordinates valid (deterministic)
//   - not a duplicate (deterministic)
//   - not an expired event (deterministic)
//   - not a non-golf/prohibited name (deterministic corroboration)
//
// Source-page fetching is SSRF-hardened:
//   - rejects localhost, loopback, private, link-local, metadata,
//     and internal network addresses
//   - validates destination URLs and redirects before each fetch
//   - permits only public http/https destinations
//   - caps redirects (5), response size (1 MB), and timeout (8 s)
//   - fails closed on DNS, redirect, parse, or fetch uncertainty
//   - records a safe failure reason without exposing internal
//     network details
//
// If any evidence is uncertain, the listing stays pending (hidden)
// and the system retries/rechecks automatically later. A listing
// must NEVER become public based on a name, generic website, Google
// snippet, URL allow/deny list, or LLM confidence alone.
// ============================================================

const ALLOWED_TYPES = new Set([
  'course', 'simulator', 'training', 'tournament',
  'charity_event', 'corporate_event', 'league', 'golf_related_venue',
]);

const EVENT_TYPES = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);

const UNTRUSTED_HOSTS = [
  'maps.google.com', 'google.com/maps', 'goo.gl', 'google.com/local',
  'yelp.com', 'tripadvisor.com', 'facebook.com', 'fb.com', 'm.facebook.com',
  'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'wikipedia.org', 'foursquare.com', 'yellowpages.com',
  'mapquest.com', 'bing.com/maps', 'apple.com/maps', 'superpages.com',
  'business.google.com', 'plus.google.com',
];

const NON_GOLF_PATTERNS = [
  'church', 'cathedral', 'ministry', 'temple', 'mosque', 'synagogue',
  'school', 'isd', 'elementary', 'middle school', 'high school', 'university', 'college',
  'hospital', 'medical', 'clinic', 'dental', 'pharmacy',
  'cemetery', 'funeral', 'mortuary',
  'restaurant', 'cafe', 'coffee', 'pizza', 'taco', 'bbq',
  'hotel', 'motel', 'gas station', 'grocery', 'supermarket', 'walmart', 'target',
  'home depot', 'lowes', 'apartment', 'real estate', 'realtor',
  'auto', 'car wash', 'tire', 'storage', 'warehouse',
  'county', 'clerk', 'city hall', 'municipal', 'post office', 'library', 'police', 'fire dept', 'fire department', 'sheriff',
];

const GOLF_KEYWORDS = ['golf', 'driving range', 'putt', 'mini golf', 'country club', 'links', 'fairway', 'simulator'];

const NAME_STOP_WORDS = new Set([
  'golf', 'course', 'club', 'center', 'centre', 'the', 'inc', 'llc', 'co',
  'ltd', 'simulator', 'indoor', 'range', 'academy', 'training', 'facility',
  'and', 'of', 'at', 'a', 'an',
]);

function isValidHttpUrl(u: string): boolean {
  if (!u || typeof u !== 'string') return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch { return false; }
}

function isTrustedSourceUrl(u: string): boolean {
  if (!isValidHttpUrl(u)) return false;
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    return !UNTRUSTED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
  } catch { return false; }
}

function isNumber(v: any): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isNonGolfName(name: string): boolean {
  const lower = (name || '').toLowerCase();
  const hasGolfKw = GOLF_KEYWORDS.some((kw) => lower.includes(kw));
  const hasNonGolfKw = NON_GOLF_PATTERNS.some((p) => lower.includes(p));
  return hasNonGolfKw && !hasGolfKw;
}

export interface Evidence {
  categoryAllowed: boolean;
  sourceTrusted: boolean;
  coordsValid: boolean;
  notExpired: boolean;
  notNonGolfName: boolean;
}

export function validateEvidence(record: any): Evidence {
  return {
    categoryAllowed: ALLOWED_TYPES.has(record.type),
    sourceTrusted: isTrustedSourceUrl(record.source_url),
    coordsValid: isNumber(record.latitude) && isNumber(record.longitude),
    notExpired: !(EVENT_TYPES.has(record.type) && record.ends_at && new Date(record.ends_at) < new Date()),
    notNonGolfName: !isNonGolfName(record.name),
  };
}

export function findDuplicate(record: any, allRecords: any[]): { isDup: boolean; reason: string | null } {
  const norm = normalizeName(record.name);
  for (const other of allRecords) {
    if (other.id === record.id) continue;
    if (norm && normalizeName(other.name) === norm) return { isDup: true, reason: 'same normalized name' };
    if (record.place_id && other.place_id === record.place_id) return { isDup: true, reason: 'same place_id' };
  }
  return { isDup: false, reason: null };
}

// ============================================================
// SSRF hardening — reject non-public destinations before fetching.
// ============================================================

// Returns true if the hostname is a private, loopback, link-local,
// metadata, or reserved address that must never be fetched.
export function isPrivateOrReservedHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 0) return true;            // 0.0.0.0/8 reserved
    if (a === 127) return true;          // 127.0.0.0/8 loopback
    if (a === 10) return true;           // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
    if (a === 192 && b === 168) return true;          // 192.168/16 private
    if (a === 169 && b === 254) return true;          // 169.254/16 link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a >= 224) return true;          // 224+/8 multicast + reserved
    return false;
  }

  // IPv6 literal (brackets stripped)
  if (host === '::1' || host === '::' || host === '::ffff:0:0') return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true; // link-local + ULA
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  if (host.startsWith('::ffff:')) {
    const embedded = host.replace('::ffff:', '');
    const v4embedded = embedded.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4embedded) return isPrivateOrReservedHost(embedded);
    return true; // unknown mapped form → fail closed
  }

  return false;
}

// Validates that a URL is http/https and points to a public destination.
// Returns { valid, reason } — reason is safe to expose (no internal details).
// For hostname-based URLs (not IP literals), resolves the hostname via DNS
// and rejects any address that is loopback, private, link-local, ULA,
// metadata, or otherwise non-public. This prevents DNS-rebinding attacks
// where a public-looking hostname resolves to an internal IP.
export async function validatePublicUrl(urlStr: string): Promise<{ valid: boolean; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'non-http protocol' };
  }
  const hostname = parsed.hostname;
  // If it's an IP literal, check directly without DNS.
  if (isPrivateOrReservedHost(hostname)) {
    return { valid: false, reason: 'blocked: non-public destination' };
  }
  // For hostnames, resolve via DNS and check every resolved address.
  // This prevents DNS-rebinding: a hostname that looks public but
  // resolves to a private/internal IP is blocked.
  try {
    const addrs = await Deno.resolveDns(hostname, 'A');
    if (!addrs || addrs.length === 0) {
      // No A records — try AAAA (IPv6)
      const addrs6 = await Deno.resolveDns(hostname, 'AAAA');
      if (!addrs6 || addrs6.length === 0) {
        return { valid: false, reason: 'blocked: DNS resolution failed' };
      }
      for (const a of addrs6) {
        if (isPrivateOrReservedHost(a)) {
          return { valid: false, reason: 'blocked: non-public destination' };
        }
      }
    } else {
      for (const a of addrs) {
        if (isPrivateOrReservedHost(a)) {
          return { valid: false, reason: 'blocked: non-public destination' };
        }
      }
    }
  } catch {
    // DNS resolution failed — fail closed.
    return { valid: false, reason: 'blocked: DNS resolution failed' };
  }
  return { valid: true, reason: '' };
}

// Synchronous variant for testing IP-literal URLs without DNS. Does NOT
// resolve hostnames — use validatePublicUrl for real fetches.
export function validatePublicUrlSync(urlStr: string): { valid: boolean; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'non-http protocol' };
  }
  if (isPrivateOrReservedHost(parsed.hostname)) {
    return { valid: false, reason: 'blocked: non-public destination' };
  }
  return { valid: true, reason: '' };
}

// ============================================================
// Source page corroboration.
// ============================================================

export interface CorroborationResult {
  corroborated: boolean;
  reason: string;
  evidence: {
    redirectMismatch?: boolean;
    sourceHost?: string;
    finalHost?: string;
    nameMatch?: boolean;
    nameMatchScore?: number;
    factMatch?: boolean;
    facts?: any[];
    matchedFacts?: string[];
    httpStatus?: number;
    fetchError?: boolean;
    urlBlocked?: boolean;
    redirectBlocked?: boolean;
    tooManyRedirects?: boolean;
  };
}

export function evaluateCorroboration(
  pageText: string,
  sourceHost: string,
  finalHost: string,
  listing: any
): CorroborationResult {
  const text = (pageText || '').toLowerCase();

  // 1. Redirect mismatch
  if (
    finalHost && sourceHost &&
    finalHost !== sourceHost &&
    !finalHost.endsWith('.' + sourceHost) &&
    !sourceHost.endsWith('.' + finalHost)
  ) {
    return {
      corroborated: false,
      reason: 'redirect mismatch: source and destination domains differ',
      evidence: { redirectMismatch: true, sourceHost, finalHost },
    };
  }

  // 2. Venue name match — strip generic golf/venue terms, require ≥50%
  const listingName = (listing.name || '').toLowerCase().trim();
  const significantTokens = listingName
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !NAME_STOP_WORDS.has(t));
  const tokensToCheck = significantTokens.length > 0
    ? significantTokens
    : listingName.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const matchedTokens = tokensToCheck.filter((t) => text.includes(t));
  const nameMatchScore = tokensToCheck.length > 0 ? matchedTokens.length / tokensToCheck.length : 0;
  const nameMatch = matchedTokens.length > 0 && nameMatchScore >= 0.5;

  // 3. Stable facts — at least one must match
  const facts: any[] = [];
  if (listing.city) {
    facts.push({ type: 'city', matched: text.includes(listing.city.toLowerCase()) });
  }
  if (listing.address) {
    const zipMatch = String(listing.address).match(/\b(\d{5})\b/);
    if (zipMatch) {
      facts.push({ type: 'zip', matched: text.includes(zipMatch[1]) });
    }
    const streetParts = String(listing.address).toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 4 && !['street', 'avenue', 'road', 'drive', 'blvd', 'lane', 'way', 'suite', 'highway', 'st', 'ave', 'rd', 'dr'].includes(t));
    const streetMatched = streetParts.filter((t) => text.includes(t));
    facts.push({
      type: 'address',
      matched: streetParts.length > 0 && streetMatched.length >= Math.ceil(streetParts.length * 0.5),
    });
  }
  if (listing.phone) {
    const phoneDigits = String(listing.phone).replace(/\D/g, '');
    const phoneLast4 = phoneDigits.slice(-4);
    if (phoneLast4) {
      facts.push({ type: 'phone', matched: text.replace(/\D/g, '').includes(phoneLast4) });
    }
  }
  if (listing.starts_at) {
    const dateStr = String(listing.starts_at).split('T')[0];
    facts.push({ type: 'event_date', matched: text.includes(dateStr) });
  }

  const matchedFacts = facts.filter((f) => f.matched).map((f) => f.type);
  const factMatch = matchedFacts.length > 0;

  if (!nameMatch) {
    return {
      corroborated: false,
      reason: 'venue name not found on source page',
      evidence: { nameMatch, nameMatchScore, factMatch, facts, matchedFacts },
    };
  }
  if (!factMatch) {
    return {
      corroborated: false,
      reason: 'name matched but no stable fact corroborated',
      evidence: { nameMatch, nameMatchScore, factMatch, facts, matchedFacts },
    };
  }

  return {
    corroborated: true,
    reason: 'source corroborated: name + stable fact matched',
    evidence: { nameMatch, nameMatchScore, factMatch, facts, matchedFacts },
  };
}

// Fetch the source URL with SSRF hardening: validate every URL (initial +
// each redirect hop) against the public-destination check, follow at most
// 5 redirects, cap response body at 1 MB, timeout at 8 s. Fail closed on
// any DNS, redirect, parse, or fetch uncertainty. Safe failure reasons
// do not expose internal network details.
export async function corroborateSourceUrl(sourceUrl: string, listing: any): Promise<CorroborationResult> {
  const initialCheck = await validatePublicUrl(sourceUrl);
  if (!initialCheck.valid) {
    return { corroborated: false, reason: initialCheck.reason, evidence: { urlBlocked: true } };
  }

  let sourceHost = '';
  try { sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch {}

  try {
    let currentUrl = sourceUrl;
    let response: Response | null = null;
    const MAX_REDIRECTS = 5;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hopCheck = await validatePublicUrl(currentUrl);
      if (!hopCheck.valid) {
        return { corroborated: false, reason: hopCheck.reason, evidence: { redirectBlocked: true } };
      }

      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { corroborated: false, reason: 'redirect missing location header', evidence: { fetchError: true } };
        }
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          return { corroborated: false, reason: 'invalid redirect URL', evidence: { fetchError: true } };
        }
        if (hop === MAX_REDIRECTS) {
          return { corroborated: false, reason: 'too many redirects', evidence: { tooManyRedirects: true } };
        }
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const status = response?.status || 0;
      return { corroborated: false, reason: `HTTP ${status}`, evidence: { httpStatus: status } };
    }

    let finalHost = '';
    try { finalHost = new URL(currentUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch {}

    // Read at most 1 MB of response body
    const MAX_SIZE = 1024 * 1024;
    const rawText = await response.text();
    const html = rawText.slice(0, MAX_SIZE);

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ');

    return evaluateCorroboration(text, sourceHost, finalHost, listing);
  } catch (e: any) {
    return { corroborated: false, reason: 'fetch error', evidence: { fetchError: true } };
  }
}

export interface VerificationDecision {
  action: 'approved' | 'rejected' | 'pending' | 'expired';
  reasons: string[];
  evidence: Evidence;
  tier?: number;
  source_url?: string;
  sourceCorroboration?: CorroborationResult | null;
}

export function decideVerification(
  record: any,
  llmResult: any,
  allRecords: any[],
  sourceCorroboration?: CorroborationResult | null
): VerificationDecision {
  const evidence = validateEvidence(record);

  if (!evidence.notExpired) {
    return { action: 'expired', reasons: ['event has ended'], evidence };
  }

  if (!llmResult || llmResult.is_golf == null) {
    return { action: 'pending', reasons: ['LLM classification unavailable — will retry'], evidence };
  }

  const llmSaysGolf = llmResult.is_golf === true;
  const tier = [1, 2, 3, 4].includes(llmResult.recommended_tier) ? llmResult.recommended_tier : 0;

  if (!llmSaysGolf || tier === 0) {
    return { action: 'rejected', reasons: [llmResult.reason || 'LLM classified as non-golf'], evidence };
  }

  if (!evidence.categoryAllowed) {
    return { action: 'rejected', reasons: ['category not allowed'], evidence };
  }

  if (!evidence.notNonGolfName) {
    return { action: 'pending', reasons: ['name matches non-golf pattern (conflicts with LLM classification)'], evidence, tier };
  }

  if (!evidence.sourceTrusted) {
    return { action: 'pending', reasons: ['no trusted official source URL'], evidence, tier };
  }

  if (!sourceCorroboration || !sourceCorroboration.corroborated) {
    return {
      action: 'pending',
      reasons: ['source not corroborated: ' + (sourceCorroboration?.reason || 'not checked')],
      evidence,
      tier,
      sourceCorroboration: sourceCorroboration || null,
    };
  }

  if (!evidence.coordsValid) {
    return { action: 'pending', reasons: ['missing valid coordinates'], evidence, tier };
  }

  const dup = findDuplicate(record, allRecords);
  if (dup.isDup) {
    return { action: 'rejected', reasons: ['duplicate: ' + dup.reason], evidence };
  }

  return {
    action: 'approved',
    reasons: [llmResult.reason || 'all evidence validated', sourceCorroboration.reason],
    evidence,
    tier,
    source_url: record.source_url,
    sourceCorroboration,
  };
}