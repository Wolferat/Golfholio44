import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import {
  SHERMAN_IMPORT_CENTER,
  DEFAULT_OPENAI_MODEL,
  MAX_LEADS_PER_QUERY,
  clampImportRadius,
  clampMaxCalls,
  clampMaxCandidates,
  haversineMi,
  planQueryPlan,
} from '../../shared/openaiDiscovery.ts';

// ============================================================
// shermanDiscoveryPreview — admin-only, READ-ONLY dry run.
//
// Makes NO OpenAI calls, NO source fetches, and NO writes. It only
// reports the plan, the deterministic upper bound of OpenAI calls,
// the candidate ceiling, and how many existing listings would be
// considered for deduplication.
//
// The import radius is a DISCOVERY boundary (default 30 miles).
// Player visibility remains 15 miles by default.
// ============================================================

function asItems(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const radius = clampImportRadius(body.radius_miles);
    const maxCalls = clampMaxCalls(body.max_openai_calls);
    const maxCandidates = clampMaxCandidates(body.max_candidates);

    const plan = planQueryPlan(radius);
    const plannedQueries = plan.queries.map((q) => ({ ...q }));

    const callsUpperBound = Math.min(plannedQueries.length, maxCalls);
    const queriesNotRunUnderCeiling = plannedQueries.slice(callsUpperBound).map((q) => q.query);

    const listings = asItems(
      await base44.asServiceRole.entities.Listing.filter({}).catch(() => [])
    );

    let approvedInRadius = 0;
    for (const l of listings) {
      if (l.status !== 'approved') continue;
      if (typeof l.latitude !== 'number' || typeof l.longitude !== 'number') continue;
      if (haversineMi(SHERMAN_IMPORT_CENTER.lat, SHERMAN_IMPORT_CENTER.lng, l.latitude, l.longitude) <= radius) {
        approvedInRadius++;
      }
    }

    // Presence only — key values are never read, logged, or returned.
    const openaiConfigured = !!secrets.get('OPENAI_API_KEY');
    const geocodingConfigured = !!secrets.get('GOOGLE_PLACES_API_KEY');

    return Response.json({
      dry_run: true,
      no_api_calls_made: true,
      no_writes_made: true,
      openai_configured: openaiConfigured,
      geocoding_configured: geocodingConfigured,
      openai_model: DEFAULT_OPENAI_MODEL,
      center: {
        label: SHERMAN_IMPORT_CENTER.label,
        latitude: SHERMAN_IMPORT_CENTER.lat,
        longitude: SHERMAN_IMPORT_CENTER.lng,
      },
      radius_miles: radius,
      player_default_radius_miles: 15,
      player_max_radius_miles: 30,
      max_openai_calls: maxCalls,
      max_candidates: maxCandidates,
      estimated_openai_calls_upper_bound: callsUpperBound,
      estimated_source_fetches_upper_bound: callsUpperBound * MAX_LEADS_PER_QUERY,
      planned_query_count: plannedQueries.length,
      planned_queries: plannedQueries,
      tiles_included: plan.tilesIncluded,
      tiles_skipped: plan.tilesSkipped,
      queries_not_run_under_ceiling: queriesNotRunUnderCeiling,
      existing_listings_considered: listings.length,
      existing_approved_in_radius: approvedInRadius,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}