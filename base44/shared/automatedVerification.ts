// ============================================================
// Automated Verification — Deterministic evidence validation.
//
// The LLM may research and classify evidence, but it must NOT be
// the sole authority approving a public listing. Every approval
// requires independently validated evidence:
//   - golf-related (LLM research, corroborated by name pattern)
//   - category allowed (deterministic)
//   - source URL official/authoritative (deterministic, NOT LLM)
//   - source uses valid http/https (deterministic)
//   - coordinates valid (deterministic)
//   - not a duplicate (deterministic)
//   - not an expired event (deterministic)
//   - not a non-golf/prohibited name (deterministic corroboration)
//
// If any evidence is uncertain, the listing stays pending (hidden)
// and the system retries/rechecks automatically later. A listing
// must NEVER become public based on a name, generic website, Google
// snippet, or LLM confidence alone.
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
// No criterion relies on LLM confidence alone.
export function validateEvidence(record: any): Evidence {
  return {
    categoryAllowed: ALLOWED_TYPES.has(record.type),
    sourceTrusted: isTrustedSourceUrl(record.source_url),
    coordsValid: isNumber(record.latitude) && isNumber(record.longitude),
    notExpired: !(EVENT_TYPES.has(record.type) && record.ends_at && new Date(record.ends_at) < new Date()),
    notNonGolfName: !isNonGolfName(record.name),
  };
}

// Check for duplicates against all other records.
export function findDuplicate(record: any, allRecords: any[]): { isDup: boolean; reason: string | null } {
  const norm = normalizeName(record.name);
  for (const other of allRecords) {
    if (other.id === record.id) continue;
    if (norm && normalizeName(other.name) === norm) return { isDup: true, reason: 'same normalized name' };
    if (record.place_id && other.place_id === record.place_id) return { isDup: true, reason: 'same place_id' };
  }
  return { isDup: false, reason: null };
}

export interface VerificationDecision {
  action: 'approved' | 'rejected' | 'pending' | 'expired';
  reasons: string[];
  evidence: Evidence;
  tier?: number;
  source_url?: string;
}

// The automated decision. LLM classifies golf relevance (research), but
// approval requires ALL independent evidence to pass. If any evidence
// is uncertain, the listing stays pending (hidden) and will be rechecked.
export function decideVerification(
  record: any,
  llmResult: any,
  allRecords: any[]
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

  // 5. Name matches non-golf patterns → uncertain (LLM says golf but name
  //    says otherwise). Stay pending — do not approve on LLM confidence alone.
  if (!evidence.notNonGolfName) {
    return { action: 'pending', reasons: ['name matches non-golf pattern (conflicts with LLM classification)'], evidence, tier };
  }

  // 6. Source URL not trusted → pending (not enough evidence to go public)
  if (!evidence.sourceTrusted) {
    return { action: 'pending', reasons: ['no trusted official source URL'], evidence, tier };
  }

  // 7. Coordinates invalid → pending (can't verify location)
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
    reasons: [llmResult.reason || 'all evidence validated'],
    evidence,
    tier,
    source_url: record.source_url,
  };
}