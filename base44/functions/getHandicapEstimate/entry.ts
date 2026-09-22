import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { buildHandicapEstimate } from '../../shared/handicapEstimate.ts';

// ============================================================
// Get Handicap Estimate — player-facing, private by default.
//
// Returns the player's Golfolio Handicap Estimate based on
// their completed 18-hole rounds with Course Rating and Slope Rating.
//
// This is NOT an official USGA/WHS Handicap Index. It is an
// estimate based on logged rounds and course difficulty.
//
// Reads from the canonical Round entity (status=completed).
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all of the user's completed rounds (RLS restricts to owner).
    const allRounds = await base44.entities.Round
      .list('-date', 200)
      .catch(() => []);

    // Only completed rounds with a score are relevant.
    const rounds = allRounds.filter((r: any) => r.status === 'completed' && r.score != null);

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