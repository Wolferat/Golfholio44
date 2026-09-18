// ============================================================
// Automated Verification — Deterministic evidence validation +
// source page corroboration.
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

// Generic terms stripped from the venue name before token matching,
// so that a page containing only "golf" or "course" does not count as
// a name match. The significant name must identify the specific venue.
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

// Independently validated evidence — each criterion checked deterministically.
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
// Source page corroboration — the source page must contain
// corroborating venue/event identity evidence. This goes beyond
// URL allow/deny lists: the actual page content is fetched and
// checked against the listing name + at least one stable fact.
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
  };
}

// Pure function — testable without HTTP. Given the page text, the
// source/final hosts (for redirect detection), and the listing,
// returns whether the page corroborates the venue/event identity.
export function evaluateCorroboration(
  pageText: string,
  sourceHost: string,
  finalHost: string,
  listing: any
): CorroborationResult {
  const text = (pageText || '').toLowerCase();

  // 1. Redirect mismatch — the page redirected to a different domain.
  if (
    finalHost && sourceHost &&
    finalHost !== sourceHost &&
    !finalHost.endsWith('.' + sourceHost) &&
    !sourceHost.endsWith('.' + finalHost)
  ) {
    return {
      corroborated: false,
      reason: `redirect mismatch: ${sourceHost} → ${finalHost}`,
      evidence: { redirectMismatch: true, sourceHost, finalHost },
    };
  }

  // 2. Venue name match — strip generic golf/venue terms, then require
  //    at least 50% of the remaining significant tokens on the page.
  //    A page containing only "golf" or "course" cannot satisfy this.
  const listingName = (listing.name || '').toLowerCase().trim();
  const significantTokens = listingName
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !NAME_STOP_WORDS.has(t));
  const tokensToCheck = significantTokens.length > 0 ? significantTokens : listingName.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const matchedTokens = tokensToCheck.filter((t) => text.includes(t));
  const nameMatchScore = tokensToCheck.length > 0 ? matchedTokens.length / tokensToCheck.length : 0;
  const nameMatch = matchedTokens.length > 0 && nameMatchScore >= 0.5;

  // 3. Stable facts — at least one must match.
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

// Fetch the source URL and evaluate corroboration against the listing.
// Follows redirects, detects redirect mismatch, strips HTML, and checks
// for venue name + at least one stable fact in the page text.
export async function corroborateSourceUrl(sourceUrl: string, listing: any): Promise<CorroborationResult> {
  try {
    const response = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        corroborated: false,
        reason: `HTTP ${response.status}`,
        evidence: { httpStatus: response.status },
      };
    }

    const finalUrl = response.url;
    let sourceHost = '';
    let finalHost = '';
    try { sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
    try { finalHost = finalUrl ? new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase() : sourceHost; } catch {}

    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ');

    return evaluateCorroboration(text, sourceHost, finalHost, listing);
  } catch (e: any) {
    return {
      corroborated: false,
      reason: `fetch error: ${e.message}`,
      evidence: { fetchError: true },
    };
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

// The automated decision. LLM classifies golf relevance (research), but
// approval requires ALL independent evidence to pass, including source
// page corroboration. If any evidence is uncertain, the listing stays
// pending (hidden) and will be rechecked.
export function decideVerification(
  record: any,
  llmResult: any,
  allRecords: any[],
  sourceCorroboration?: CorroborationResult | null
): VerificationDecision {
  const evidence = validateEvidence(record);

  // 1. Expired event → expire (deterministic, no LLM needed)
  if (!evidence.notExpired) {
    return { action: 'expired', reasons: ['event has ended'], evidence };
  }

  // 2. LLM result missing or ambiguous → pending (fail-closed, retry later)
  if (!llmResult || llmResult.is_golf == null) {
    return { action: 'pending', reasons: ['LLM classification unavailable — will retry'], evidence };
  }

  const llmSaysGolf = llmResult.is_golf === true;
  const tier = [1, 2, 3, 4].includes(llmResult.recommended_tier) ? llmResult.recommended_tier : 0;

  // 3. LLM says not golf → reject
  if (!llmSaysGolf || tier === 0) {
    return { action: 'rejected', reasons: [llmResult.reason || 'LLM classified as non-golf'], evidence };
  }

  // --- From here, LLM says golf. Now require ALL independent evidence. ---

  // 4. Category not allowed → reject (deterministic)
  if (!evidence.categoryAllowed) {
    return { action: 'rejected', reasons: ['category not allowed'], evidence };
  }

  // 5. Name matches non-golf patterns → uncertain → pending
  if (!evidence.notNonGolfName) {
    return { action: 'pending', reasons: ['name matches non-golf pattern (conflicts with LLM classification)'], evidence, tier };
  }

  // 6. Source URL not trusted (http/https, not untrusted host) → pending
  if (!evidence.sourceTrusted) {
    return { action: 'pending', reasons: ['no trusted official source URL'], evidence, tier };
  }

  // 6b. Source page must corroborate the venue/event identity.
  //     A clean-looking domain on an allow/deny list is NOT enough —
  //     the actual page content must contain the venue name + at least
  //     one stable fact. Missing page, redirect mismatch, unrelated
  //     business, weak match, or uncertainty → pending (hidden).
  if (!sourceCorroboration || !sourceCorroboration.corroborated) {
    return {
      action: 'pending',
      reasons: ['source not corroborated: ' + (sourceCorroboration?.reason || 'not checked')],
      evidence,
      tier,
      sourceCorroboration: sourceCorroboration || null,
    };
  }

  // 7. Coordinates invalid → pending
  if (!evidence.coordsValid) {
    return { action: 'pending', reasons: ['missing valid coordinates'], evidence, tier };
  }

  // 8. Duplicate check (deterministic)
  const dup = findDuplicate(record, allRecords);
  if (dup.isDup) {
    return { action: 'rejected', reasons: ['duplicate: ' + dup.reason], evidence };
  }

  // 9. All evidence passes → approve
  return {
    action: 'approved',
    reasons: [llmResult.reason || 'all evidence validated', sourceCorroboration.reason],
    evidence,
    tier,
    source_url: record.source_url,
    sourceCorroboration,
  };
}