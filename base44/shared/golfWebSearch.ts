// ============================================================
// Golf venues the web knows about — one bounded web search whose
// only job is to NAME venues that offer golf.
//
// Google's own keyword search cannot see golf that runs inside a
// business named for something else: a bowling alley with a
// simulator, a sports bar with three bays, a family entertainment
// center. Their websites describe the golf; their Google listing
// only says "restaurant". So the web search names the venue and
// Google Places is then used to anchor its identity (place_id,
// address, coordinates) — no approval happens here.
// ============================================================

import { collectSearchEvidence } from './openaiDiscovery.ts';
import { outputText, sameSite, usableWebsite } from './venueEnrichment.ts';

export interface SearchVenueLead {
  name: string;
  city: string;
  state: string;
  website: string;
  // Every URL the search actually returned, so a caller can keep the
  // evidence trail.
  evidence_urls: string[];
}

const VENUES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    venues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          website: { type: 'string' },
        },
        required: ['name', 'city', 'state', 'website'],
      },
    },
  },
  required: ['venues'],
};

function promptFor(input: { city: string; state: string; radiusMi: number; limit: number }): string {
  const near = [input.city, input.state].filter(Boolean).join(', ');
  return [
    `List real businesses within ${input.radiusMi} miles of ${near} in the United States that offer golf to the public.`,
    'Include golf courses, driving ranges, indoor golf and golf simulator venues, mini golf, golf instruction and golf shops.',
    'ALSO include any other kind of business that has golf inside it — such as a bowling alley, sports bar, restaurant, hotel, arcade or family entertainment center with a golf simulator, golf bays or mini golf.',
    'Use web search and include only businesses you find evidence for; never guess or invent a business.',
    `Return up to ${input.limit} venues.`,
    'For each venue give the name exactly as the business writes it, its city, its two-letter state, and the venue\'s own official website URL — or an empty string when it has no website of its own.',
    'Never use a directory, review site, golf aggregator, tee-time marketplace, social media page or Google Maps link as the website.',
  ].join(' ');
}

export async function discoverVenuesByWebSearch(
  apiKey: string,
  input: { city: string; state: string; radiusMi: number; limit?: number },
  timeoutMs = 30000
): Promise<SearchVenueLead[]> {
  if (!apiKey) return [];
  const limit = Math.min(Math.max(Math.floor(Number(input.limit) || 6), 1), 10);

  const body = {
    model: 'gpt-4.1-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: { type: 'web_search' },
    include: ['web_search_call.action.sources'],
    input: promptFor({ ...input, limit }),
    text: {
      format: { type: 'json_schema', name: 'golf_venues', strict: true, schema: VENUES_SCHEMA },
    },
  };

  let data: any = null;
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    data = await res.json().catch(() => null);
  } catch {
    return [];
  }

  const { urls } = collectSearchEvidence(data);
  const text = outputText(data);
  if (!text.trim()) return [];

  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed?.venues) ? parsed.venues : [];
  const leads: SearchVenueLead[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = String(row?.name || '').trim();
    if (name.length < 2) continue;
    const dedup = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!dedup || seen.has(dedup)) continue;
    seen.add(dedup);

    // A website counts only when it is a real venue site AND it actually
    // appeared in the search results. A made-up domain can never pass.
    const candidate = usableWebsite(row?.website);
    const website = candidate && urls.some((u) => sameSite(u, candidate)) ? candidate : '';

    leads.push({
      name,
      city: String(row?.city || input.city || '').trim(),
      state: String(row?.state || input.state || '').trim(),
      website,
      evidence_urls: urls,
    });
    if (leads.length >= limit) break;
  }

  return leads;
}