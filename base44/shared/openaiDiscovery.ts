// ============================================================
// OpenAI Responses API web_search discovery — one-time Sherman, TX
// import.
//
// OpenAI is a LEAD SOURCE ONLY. A model answer is never proof.
// Nothing in this module approves a listing: every lead must pass
// the independent official-source checks in
// officialSourceVerification.ts and the existing
// publicListingPolicy.ts trust gate.
//
// This pipeline deliberately uses NO Google Places Nearby/Text/
// Details calls, NO Google Places photos, and NO Base44
// Core.InvokeLLM.
// ============================================================

export const SHERMAN_IMPORT_CENTER = { lat: 33.6357, lng: -96.6089, label: 'Sherman, TX' };

// The import radius is a DISCOVERY boundary only. Player visibility
// stays at 15 miles (30 only when a player manually expands it).
export const DEFAULT_IMPORT_RADIUS_MI = 30;
export const MIN_IMPORT_RADIUS_MI = 5;
export const MAX_IMPORT_RADIUS_MI = 30;

export const DEFAULT_MAX_OPENAI_CALLS = 34;
export const MAX_OPENAI_CALLS_CEILING = 40;
export const DEFAULT_MAX_CANDIDATES = 220;
export const MAX_CANDIDATES_CEILING = 240;

export const MAX_LEADS_PER_QUERY = 10;
export const MAX_SOURCE_FETCHES_PER_QUERY = 10;

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

// Tiles are city-level so one response cannot silently miss venues.
// Every tile below is inside the default 30-mile import boundary.
export const IMPORT_TILES = [
  { city: 'Sherman', state: 'TX', lat: 33.6357, lng: -96.6089 },
  { city: 'Denison', state: 'TX', lat: 33.7557, lng: -96.5364 },
  { city: 'Pottsboro', state: 'TX', lat: 33.7598, lng: -96.6717 },
  { city: 'Howe', state: 'TX', lat: 33.5087, lng: -96.6122 },
  { city: 'Whitesboro', state: 'TX', lat: 33.6573, lng: -97.0 },
  { city: 'Bonham', state: 'TX', lat: 33.5773, lng: -96.1783 },
];

// Seven golf verticals. Each lane has its own query phrase, its own page
// vocabulary (CATEGORY_SIGNALS), and its own published entity type.
export const DISCOVERY_CATEGORIES = [
  { key: 'course', entity_type: 'course', phrase: 'public and private golf courses' },
  { key: 'indoor_simulator', entity_type: 'simulator', phrase: 'indoor golf simulators and golf lounges' },
  { key: 'driving_range', entity_type: 'golf_related_venue', phrase: 'golf driving ranges and practice facilities' },
  { key: 'golf_instruction', entity_type: 'training', phrase: 'golf lessons and instruction academies' },
  { key: 'mini_golf', entity_type: 'golf_related_venue', phrase: 'mini golf and putting courses' },
  { key: 'entertainment_golf', entity_type: 'simulator', phrase: 'Topgolf-style entertainment golf and golf driving bays' },
  { key: 'golf_retail_fitting', entity_type: 'golf_related_venue', phrase: 'golf shops and club fitting studios' },
];

// The two anchor cities get every lane. The outer tiles get the four
// highest-yield lanes so the plan stays inside the call ceiling.
export const FULL_LANE_TILES = ['Sherman', 'Denison'];
export const STANDARD_LANES = ['course', 'indoor_simulator', 'driving_range', 'entertainment_golf'];

// Appended to every query to suppress the two contamination modes seen in
// live runs: disc golf and cemetery listings.
export const NEGATIVE_TERMS = '-disc -cemetery -funeral';

export function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function clampImportRadius(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_IMPORT_RADIUS_MI;
  return Math.min(Math.max(Math.round(n), MIN_IMPORT_RADIUS_MI), MAX_IMPORT_RADIUS_MI);
}

export function clampMaxCalls(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_OPENAI_CALLS;
  return Math.min(Math.max(Math.round(n), 1), MAX_OPENAI_CALLS_CEILING);
}

export function clampMaxCandidates(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_CANDIDATES;
  return Math.min(Math.max(Math.round(n), 1), MAX_CANDIDATES_CEILING);
}

export function encodePlannedQuery(category: string, query: string): string {
  return `${category}||${query}`;
}

export function decodePlannedQuery(encoded: string): { category: string; query: string } {
  const raw = String(encoded || '');
  const idx = raw.indexOf('||');
  if (idx === -1) return { category: '', query: raw };
  return { category: raw.slice(0, idx), query: raw.slice(idx + 2) };
}

// Build the deterministic query plan. Tiles outside the chosen radius
// are reported, never silently dropped.
export function planQueryPlan(radiusMiles: any) {
  const radius = clampImportRadius(radiusMiles);
  const center = SHERMAN_IMPORT_CENTER;
  const tilesIncluded: any[] = [];
  const tilesSkipped: any[] = [];

  for (const tile of IMPORT_TILES) {
    const d = haversineMi(center.lat, center.lng, tile.lat, tile.lng);
    if (d <= radius) tilesIncluded.push({ ...tile, distance_miles: Math.round(d * 10) / 10 });
    else tilesSkipped.push({ ...tile, distance_miles: Math.round(d * 10) / 10 });
  }

  const queries: any[] = [];
  const lanesByTile: Record<string, string[]> = {};
  for (const tile of tilesIncluded) {
    const laneSet = FULL_LANE_TILES.includes(tile.city)
      ? DISCOVERY_CATEGORIES
      : DISCOVERY_CATEGORIES.filter((c) => STANDARD_LANES.includes(c.key));
    lanesByTile[`${tile.city}, ${tile.state}`] = laneSet.map((c) => c.key);
    for (const cat of laneSet) {
      queries.push({
        category: cat.key,
        entity_type: cat.entity_type,
        coverage: FULL_LANE_TILES.includes(tile.city) ? 'full' : 'standard',
        tile: `${tile.city}, ${tile.state}`,
        query: `${cat.phrase} in ${tile.city}, ${tile.state} ${NEGATIVE_TERMS}`,
      });
    }
  }

  return { radius, tilesIncluded, tilesSkipped, queries, lanesByTile };
}

// ------------------------------------------------------------
// Name-based exclusions. These run BEFORE any network call so an
// obviously out-of-scope business never costs an API call.
// ------------------------------------------------------------
// Mini golf is now an in-scope lane, so it is no longer a hard exclude.
const HARD_EXCLUDE_PATTERNS = [
  'disc golf', 'discgolf',
];

// Never published, whatever else the record looks like.
const UNSAFE_EXCLUDE_PATTERNS = [
  'gun range', 'guns', 'gun shop', 'gun club', 'firearm', 'shooting range',
  'ammunition', 'ammo ', 'sportsbook', 'liquor store', 'casino',
];

const ADULT_EXCLUDE_PATTERNS = [
  'adult', 'gentlemen', 'strip club', 'topless', 'lingerie', 'escort', 'sex ',
];

const NON_GOLF_PATTERNS = [
  'medical', 'clinic', 'hospital', 'dental', 'dentist', 'urgent care', 'pharmacy',
  'chiropract', 'orthodont', 'veterinar',
  'hotel', 'motel', 'inn ', 'suites', 'lodging', 'bed and breakfast',
  'restaurant', 'cafe', 'coffee', 'pizza', 'taco', 'bbq', 'bar & grill',
  'bar and grill', 'brewery', 'tavern', 'saloon', 'grill',
  'bowling', 'arcade', 'laser tag', 'trampoline', 'cinema', 'movie', 'casino',
  'church', 'cathedral', 'school', 'university', 'college', 'library',
  'city hall', 'post office', 'bank ',
  'apartment', 'realt', 'storage', 'warehouse', 'grocery', 'supermarket',
  'walmart', 'target ', 'car wash', 'tire ', 'automotive',
  'funeral', 'cemetery', 'mortuary',
  // Retail chains, outlets and storefront services — never venues.
  'subway', 'home depot', 'u-haul', 'at&t', 'buckle', 'crocs', 'perfumania',
  'lane bryant', 'famous footwear', 'vitamin world', 'little caesars', 'braum',
  'rocky mountain chocolate', 'midway mall', 'shops at', 'outlet center',
  'jackson hewitt', 'trade days', 'haunted', 'christmas tree farm',
  'karting', 'visitors center', 'donut', 'nail salon', 'insurance',
];

const GOLF_NAME_SIGNALS = [
  'golf', 'country club', 'driving range', 'tee time', 'par 3', 'links',
  'fairway', 'putting green', 'simulator', 'golf academy', 'putt',
  'topgolf', 'golf lounge', 'club fitting', 'pro shop',
];

// A lead is only verifiable when it carries a real street address: a
// street number plus a street name or postal code. City-only strings
// ("Sherman, TX") are NOT usable — nothing can be confirmed from them.
export function isUsableStreetAddress(address: any): boolean {
  const raw = String(address || '').trim();
  if (raw.length < 8) return false;
  const number = raw.match(/\b(\d{2,6})\b/);
  if (!number) return false;
  const hasZip = /\b\d{5}\b/.test(raw);
  const hasStreetWord = /[a-z]{4,}/i.test(raw);
  if (!hasStreetWord) return false;
  // A number and a street word are the minimum; the ZIP merely has to
  // not be the only thing present.
  return hasZip || hasStreetWord;
}

export function hasGolfNameSignal(name: string): boolean {
  const lower = String(name || '').toLowerCase();
  return GOLF_NAME_SIGNALS.some((k) => lower.includes(k));
}

export interface LeadNameVerdict {
  excluded: boolean;
  reason: string;
  // A non-golf business word appears in the name. That alone never rejects
  // a venue — an entertainment center, bowling alley or bar can host a golf
  // simulator — so the caller must find golf evidence in the venue's own
  // content instead of trusting the name either way.
  requiresGolfEvidence: boolean;
}

export function classifyLeadName(name: string): LeadNameVerdict {
  const lower = String(name || '').toLowerCase();
  if (!lower.trim()) return { excluded: true, reason: 'missing venue name', requiresGolfEvidence: false };

  const hard = HARD_EXCLUDE_PATTERNS.find((p) => lower.includes(p));
  if (hard) return { excluded: true, reason: `out of scope: ${hard}`, requiresGolfEvidence: false };

  const adult = ADULT_EXCLUDE_PATTERNS.find((p) => lower.includes(p));
  if (adult) return { excluded: true, reason: 'adult/unsafe business signal', requiresGolfEvidence: false };

  const unsafe = UNSAFE_EXCLUDE_PATTERNS.find((p) => lower.includes(p));
  if (unsafe) {
    return { excluded: true, reason: `excluded business type: ${unsafe.trim()}`, requiresGolfEvidence: false };
  }

  const golfSignal = GOLF_NAME_SIGNALS.some((k) => lower.includes(k));
  const nonGolf = NON_GOLF_PATTERNS.find((p) => lower.includes(p));
  if (nonGolf && !golfSignal) {
    return {
      excluded: false,
      reason: `name reads as a non-golf business ("${nonGolf.trim()}") — golf evidence required from the venue itself`,
      requiresGolfEvidence: true,
    };
  }

  return { excluded: false, reason: '', requiresGolfEvidence: false };
}

export const CATEGORY_SIGNALS: Record<string, string[]> = {
  course: [
    'golf course', '18-hole', '18 hole', '9-hole', '9 hole', 'championship',
    'par 72', 'par 71', 'par 70', 'tee time', 'country club', 'golf links',
  ],
  indoor_simulator: [
    'simulator', 'indoor golf', 'trackman', 'foresight', 'aboutgolf',
    'golf lounge', 'simulator bay', 'golf bay',
  ],
  driving_range: [
    'driving range', 'practice range', 'range balls', 'grass tees', 'mat tees',
    'practice facility',
  ],
  golf_instruction: [
    'golf lesson', 'lessons', 'instruction', 'academy', 'coaching', 'golf clinic',
    'pga professional', 'teaching professional', 'golf school',
  ],
  mini_golf: [
    'mini golf', 'miniature golf', 'putt-putt', 'putt putt', 'putting course',
    'adventure golf', 'mini-golf',
  ],
  entertainment_golf: [
    'golf bay', 'hitting bay', 'driving bay', 'topgolf', 'top golf', 'drive shack',
    'golf suite', 'simulator bar', 'entertainment golf',
  ],
  golf_retail_fitting: [
    'club fitting', 'custom fitting', 'golf shop', 'pro shop', 'golf retail',
    'fitting studio', 'club repair',
  ],
};

// A closed venue must never be published. Only unambiguous closure
// phrasing counts — "closed Mondays" is an opening-hours statement.
const CLOSED_PATTERNS = [
  'permanently closed', 'temporarily closed', 'closed permanently',
  'no longer open', 'out of business', 'ceased operations',
  'course is closed', 'has closed',
];

export function detectClosedBusiness(text: string): string {
  const lower = String(text || '').toLowerCase();
  const hit = CLOSED_PATTERNS.find((p) => lower.includes(p));
  return hit ? `venue appears closed: ${hit}` : '';
}

export function detectCategories(text: string): Set<string> {
  const lower = String(text || '').toLowerCase();
  const found = new Set<string>();
  for (const [key, signals] of Object.entries(CATEGORY_SIGNALS)) {
    if (signals.some((s) => lower.includes(s))) found.add(key);
  }
  return found;
}

export function normalizeCategory(value: any): string {
  const raw = String(value || '').toLowerCase().trim();
  const map: Record<string, string> = {
    golf_course: 'course',
    course: 'course',
    public_golf_course: 'course',
    indoor_simulator: 'indoor_simulator',
    simulator: 'indoor_simulator',
    golf_simulator: 'indoor_simulator',
    driving_range: 'driving_range',
    golf_range: 'driving_range',
    practice_range: 'driving_range',
    golf_instruction: 'golf_instruction',
    instruction: 'golf_instruction',
    training: 'golf_instruction',
    golf_academy: 'golf_instruction',
    mini_golf: 'mini_golf',
    miniature_golf: 'mini_golf',
    putt_putt: 'mini_golf',
    putting_course: 'mini_golf',
    entertainment_golf: 'entertainment_golf',
    topgolf: 'entertainment_golf',
    golf_lounge: 'entertainment_golf',
    golf_retail_fitting: 'golf_retail_fitting',
    golf_retail: 'golf_retail_fitting',
    club_fitting: 'golf_retail_fitting',
    pro_shop: 'golf_retail_fitting',
  };
  return map[raw] || '';
}

export function normalizeWebsiteUrl(value: any): string {
  if (!value || typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function domainOf(url: string): string {
  return hostOf(url);
}

// Exact host or dot-boundary suffix match only. Never a bare substring:
// 'x.com' must not match 'eaglesnestctx.com'.
export function hostMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function normalizeName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeAddress(address: string): string {
  return String(address || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDedupKey(input: {
  name?: string;
  address?: string;
  website?: string;
  coords?: { lat: number; lng: number } | null;
}): string {
  const domain = domainOf(input.website || '');
  const name = normalizeName(input.name || '');
  const addr = normalizeAddress(input.address || '');
  const coords = input.coords
    ? `${Number(input.coords.lat).toFixed(3)},${Number(input.coords.lng).toFixed(3)}`
    : '';
  return [domain, name, addr || coords].filter(Boolean).join('|');
}

// ------------------------------------------------------------
// OpenAI Responses API
// ------------------------------------------------------------

export function assertApiKeyPresent(key: any): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}

const LEAD_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    category: {
      type: 'string',
      enum: [
        'course', 'indoor_simulator', 'driving_range', 'golf_instruction',
        'mini_golf', 'entertainment_golf', 'golf_retail_fitting', 'other',
      ],
    },
    city: { type: 'string' },
    state: { type: 'string' },
    address: { type: 'string' },
    website: { type: 'string' },
    latitude: { type: ['number', 'null'] },
    longitude: { type: ['number', 'null'] },
    phone: { type: 'string' },
  },
  required: ['name', 'category', 'city', 'state', 'address', 'website', 'latitude', 'longitude', 'phone'],
};

const LEADS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    leads: { type: 'array', items: LEAD_ITEM_SCHEMA },
  },
  required: ['leads'],
};

export function buildOpenAIRequestBody(query: string, model = DEFAULT_OPENAI_MODEL) {
  const instructions = [
    'You are a venue lead researcher for a golf app. Search the web and return REAL permanent golf venues.',
    'Allowed categories: public/private golf courses, indoor golf simulators and golf lounges, driving ranges and practice facilities, golf instruction academies, mini golf and putting courses, Topgolf-style entertainment golf with driving bays, and golf retail/club-fitting studios.',
    'Exclude: disc golf, one-off events/tournaments, hotels, restaurants, bars without a primary golf business, medical offices, big-box retail, civic buildings, cemeteries, funeral homes, firearms/shooting ranges, gambling, generic arcades with no golf, and any adult/unsafe business.',
    'For entertainment golf the business must offer real golf hitting (bays, simulators, TrackMan); a sports bar alone is not eligible. For retail/fitting it must offer club fitting or a golf pro shop.',
    'Every lead MUST include the venue official website. Directory, social, review-site, and map URLs are not official websites.',
    'Every lead MUST include the venue full street address with postal code, e.g. "1800 N Travis St, Sherman, TX 75090". A city name alone is not an address.',
    'If you cannot find the street address for a venue, OMIT that venue from the results entirely. Never return a venue with a blank or city-only address.',
    'Prefer the venue address exactly as it appears on the venue own website.',
    'Never invent a venue, address, phone number, or coordinate. If a field other than the address is unknown, return an empty string (or null for coordinates).',
    'Return at most 10 leads. Only venues physically located in or near the queried city.',
  ].join(' ');

  return {
    model: model || DEFAULT_OPENAI_MODEL,
    tools: [{ type: 'web_search' }],
    // Force the search: an answer produced without a web_search call is
    // never accepted as discovery evidence.
    tool_choice: { type: 'web_search' },
    // Ask the API to expand the URLs the search actually surfaced. Without
    // this the response carries no citable sources, and every lead would
    // fail the per-lead evidence gate.
    include: ['web_search_call.action.sources'],
    input: `${instructions}\n\nSearch query: ${query}`,
    text: {
      format: {
        type: 'json_schema',
        name: 'venue_leads',
        strict: true,
        schema: LEADS_SCHEMA,
      },
    },
  };
}

export interface ParsedOpenAIResult {
  ok: boolean;
  leads: any[];
  reason: string;
  refusal: boolean;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  // Proof that a real web-search call happened, plus the URLs it cited.
  // A response with zero search calls fails closed.
  search_calls: number;
  evidence_urls: string[];
}

// Collect web-search proof: how many web_search_call items the API
// actually executed, and every URL it cited (action sources +
// url_citation annotations). Zero calls = not a search result.
export function collectSearchEvidence(data: any): { searchCalls: number; urls: string[] } {
  const urls = new Set<string>();
  let searchCalls = 0;
  const output = Array.isArray(data?.output) ? data.output : [];

  for (const item of output) {
    if (item?.type === 'web_search_call') {
      searchCalls++;
      const sources = item?.action?.sources;
      if (Array.isArray(sources)) {
        for (const s of sources) {
          if (typeof s?.url === 'string' && s.url) urls.add(s.url);
        }
      }
      if (typeof item?.action?.url === 'string' && item.action.url) urls.add(item.action.url);
    }
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (!Array.isArray(part?.annotations)) continue;
        for (const a of part.annotations) {
          if (typeof a?.url === 'string' && a.url) urls.add(a.url);
        }
      }
    }
  }
  return { searchCalls, urls: Array.from(urls) };
}

// Per-lead search evidence. The lead's official website must appear in
// the URLs the web search actually returned. A model-invented lead has
// no way to satisfy this.
export function leadHasSearchEvidence(
  lead: any,
  evidenceUrls: string[]
): { matched: boolean; reason: string } {
  const website = normalizeWebsiteUrl(lead?.website);
  if (!website) {
    return { matched: false, reason: 'lead has no official website to match against search results' };
  }
  const leadHost = hostOf(website);
  if (!leadHost) return { matched: false, reason: 'lead website host is invalid' };

  const matched = (evidenceUrls || []).some((u) => hostMatches(hostOf(u), leadHost));
  return matched
    ? { matched: true, reason: '' }
    : { matched: false, reason: 'lead website does not appear in the web-search results' };
}

export function parseOpenAIResponse(data: any): ParsedOpenAIResult {
  const usage = {
    input_tokens: Number(data?.usage?.input_tokens) || 0,
    output_tokens: Number(data?.usage?.output_tokens) || 0,
    total_tokens: Number(data?.usage?.total_tokens) || 0,
  };
  const search = collectSearchEvidence(data);
  const fail = (reason: string, refusal = false): ParsedOpenAIResult => ({
    ok: false,
    leads: [],
    reason,
    refusal,
    usage,
    search_calls: search.searchCalls,
    evidence_urls: search.urls,
  });

  if (!data || typeof data !== 'object') return fail('empty response');

  if (data.error) {
    const code = data.error.code || data.error.type || 'api_error';
    return fail(`openai error: ${String(code)}`);
  }
  if (data.status === 'failed') return fail('openai response status failed');
  if (data.status === 'incomplete') return fail('openai response incomplete');

  // Hard requirement: the model must actually have searched the web.
  // An answer produced without a web_search call is not discovery
  // evidence and is never accepted.
  if (search.searchCalls === 0) {
    return fail('no web search call was made for this query');
  }

  let text = '';
  let refusal = false;
  const output = Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'refusal') {
        refusal = true;
      } else if (part?.type === 'output_text' && typeof part.text === 'string') {
        text += part.text;
      }
    }
  }
  if (!text && typeof data.output_text === 'string') text = data.output_text;

  if (refusal) return fail('model refused the request', true);
  if (!text.trim()) return fail('no output text');

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('malformed json output');
  }

  if (!parsed || !Array.isArray(parsed.leads)) return fail('malformed payload: leads array missing');

  const leads = parsed.leads.filter((l: any) => l && typeof l === 'object');
  return {
    ok: true,
    leads,
    reason: '',
    refusal: false,
    usage,
    search_calls: search.searchCalls,
    evidence_urls: search.urls,
  };
}

export async function callOpenAIWebSearch(
  apiKey: string,
  query: string,
  model = DEFAULT_OPENAI_MODEL,
  timeoutMs = 60000
): Promise<ParsedOpenAIResult> {
  if (!assertApiKeyPresent(apiKey)) {
    return {
      ok: false,
      leads: [],
      reason: 'missing openai api key',
      refusal: false,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAIRequestBody(query, model)),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        ok: false,
        leads: [],
        reason: `openai http ${res.status}`,
        refusal: false,
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      };
    }

    const data = await res.json().catch(() => null);
    const parsed = parseOpenAIResponse(data);
    if (res.status === 200 && !parsed.ok) {
      // Malformed/refused output is a fail-closed stop, never a partial import.
      return parsed;
    }
    return parsed;
  } catch (e: any) {
    return {
      ok: false,
      leads: [],
      reason: `openai request failed: ${String(e?.name || 'error')}`,
      refusal: false,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    };
  }
}