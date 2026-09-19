import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildHandicapEstimate } from '../../shared/handicapEstimate.ts';

// ============================================================
// Get Handicap Estimate — player-facing, private by default.
//
// Returns the player's Golfolio Handicap Estimate based on
// their logged 18-hole rounds with Course Rating and Slope Rating.
//
// This is NOT an official USGA/WHS Handicap Index. It is an
// estimate based on logged rounds and course difficulty.
//
// Authenticated players only. Returns only the current user's
// own rounds (RLS enforces this).
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all of the user's rounds (RLS restricts to owner)
    const rounds = await base44.entities.RoundLog
      .list('-date', 100)
      .catch(() => []);

    const result = buildHandicapEstimate(rounds);

    return Response.json({
      estimate: result.estimate,
      eligibleCount: result.eligibleCount,
      differentials: result.differentials,
      lastUpdated: result.lastUpdated,
      disclaimer: 'Golfolio\u2019s estimate uses your logged rounds and course difficulty. It is not an official Handicap Index.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}