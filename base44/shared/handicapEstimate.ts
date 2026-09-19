// ============================================================
// Golfolio Handicap Estimate — truthful, useful, not official.
//
// This is NOT a USGA/WHS Handicap Index. It is an estimate based
// on a player's logged rounds and course difficulty data. It
// does not use official PCC, exceptional-score reductions,
// low-handicap caps, committee adjustments, or expected-score
// logic because Golfolio lacks authoritative inputs for those.
//
// Score Differential (18-hole):
//   (113 / Slope Rating) × (Adjusted Gross Score − Course Rating − PCC)
//   Rounded to one decimal place.
//
// Fewer-than-20 scoring-record table:
//   3:  lowest 1,  minus 2.0
//   4:  lowest 1,  minus 1.0
//   5:  lowest 1
//   6:  avg lowest 2, minus 1.0
//   7-8:  avg lowest 2
//   9-11: avg lowest 3
//   12-14: avg lowest 4
//   15-16: avg lowest 5
//   17-18: avg lowest 6
//   19:    avg lowest 7
//   20:    avg lowest 8
//
// Maximum estimate: 54.0
//
// 9-hole rounds are NOT used for the 18-hole estimate. They are
// preserved for personal stats and shown separately.
// ============================================================

export const MAX_HANDICAP_ESTIMATE = 54.0;
export const MIN_ELIGIBLE_SCORES = 3;
export const MAX_SCORES_CONSIDERED = 20;

// Fewer-than-20 adjustment table: number of lowest differentials
// to average, and the adjustment to apply to that average.
const FEWER_THAN_20: Record<number, { count: number; adjustment: number }> = {
  3: { count: 1, adjustment: -2.0 },
  4: { count: 1, adjustment: -1.0 },
  5: { count: 1, adjustment: 0 },
  6: { count: 2, adjustment: -1.0 },
  7: { count: 2, adjustment: 0 },
  8: { count: 2, adjustment: 0 },
  9: { count: 3, adjustment: 0 },
  10: { count: 3, adjustment: 0 },
  11: { count: 3, adjustment: 0 },
  12: { count: 4, adjustment: 0 },
  13: { count: 4, adjustment: 0 },
  14: { count: 4, adjustment: 0 },
  15: { count: 5, adjustment: 0 },
  16: { count: 5, adjustment: 0 },
  17: { count: 6, adjustment: 0 },
  18: { count: 6, adjustment: 0 },
  19: { count: 7, adjustment: 0 },
  20: { count: 8, adjustment: 0 },
};

// ------------------------------------------------------------
// Calculate a single Score Differential for an 18-hole round.
// Returns null if required inputs are missing or invalid.
// ------------------------------------------------------------
export function calculateScoreDifferential(
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number,
  pccAdjustment: number = 0
): number | null {
  if (!Number.isFinite(adjustedGrossScore) || !Number.isFinite(courseRating) || !Number.isFinite(slopeRating)) {
    return null;
  }
  if (slopeRating <= 0) return null;
  if (adjustedGrossScore < 1 || adjustedGrossScore > 300) return null;

  const differential = (113 / slopeRating) * (adjustedGrossScore - courseRating - (pccAdjustment || 0));
  // Round to one decimal place
  return Math.round(differential * 10) / 10;
}

// ------------------------------------------------------------
// Determine whether a round is eligible for the Handicap Estimate.
// Returns { eligible, reason }.
// ------------------------------------------------------------
export function determineEligibility(round: any): { eligible: boolean; reason: string | null } {
  if (!round) return { eligible: false, reason: 'no round data' };

  if (round.holes === 9) {
    return { eligible: false, reason: '9-hole rounds do not count toward the 18-hole estimate' };
  }

  if (round.holes !== 18) {
    return { eligible: false, reason: 'round is not 18 holes' };
  }

  const hasRating = round.course_rating != null && Number.isFinite(round.course_rating) && round.course_rating > 0;
  const hasSlope = round.slope_rating != null && Number.isFinite(round.slope_rating) && round.slope_rating > 0;
  if (!hasRating || !hasSlope) {
    return { eligible: false, reason: 'missing Course Rating or Slope Rating' };
  }

  const ags = round.adjusted_gross_score != null ? round.adjusted_gross_score : round.score;
  if (!Number.isFinite(ags) || ags < 1) {
    return { eligible: false, reason: 'missing or invalid score' };
  }

  return { eligible: true, reason: null };
}

// ------------------------------------------------------------
// Calculate the Handicap Estimate from a list of eligible
// score differentials. Returns null if fewer than 3.
// ------------------------------------------------------------
export function calculateHandicapEstimate(differentials: number[]): number | null {
  if (!differentials || differentials.length < MIN_ELIGIBLE_SCORES) return null;

  // Use the most recent 20
  const recent = differentials.slice(0, MAX_SCORES_CONSIDERED);
  const n = recent.length;

  const rule = FEWER_THAN_20[n];
  if (!rule) return null;

  // Sort ascending (lowest first)
  const sorted = [...recent].sort((a, b) => a - b);

  // Take the lowest N
  const lowest = sorted.slice(0, rule.count);
  if (lowest.length === 0) return null;

  // Average them
  const avg = lowest.reduce((s, d) => s + d, 0) / lowest.length;

  // Apply adjustment
  const estimate = avg + rule.adjustment;

  // Cap at 54.0, floor at 0
  return Math.min(Math.max(estimate, 0), MAX_HANDICAP_ESTIMATE);
}

// ------------------------------------------------------------
// Full estimate calculation from a list of RoundLog records.
// Returns the estimate, eligible count, and a per-round breakdown.
// ------------------------------------------------------------
export interface HandicapEstimateResult {
  estimate: number | null;
  eligibleCount: number;
  differentials: Array<{
    roundId: string;
    date: string;
    listingName: string | null;
    differential: number;
    eligible: boolean;
    reason: string | null;
  }>;
  lastUpdated: string | null;
}

export function buildHandicapEstimate(rounds: any[]): HandicapEstimateResult {
  // Sort by date descending (most recent first)
  const sorted = [...rounds].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    return da < db ? 1 : da > db ? -1 : 0;
  });

  const differentials: number[] = [];
  const breakdown: HandicapEstimateResult['differentials'] = [];

  for (const round of sorted) {
    const { eligible, reason } = determineEligibility(round);

    if (eligible) {
      const ags = round.adjusted_gross_score != null ? round.adjusted_gross_score : round.score;
      const pcc = round.pcc_adjustment || 0;
      const diff = calculateScoreDifferential(ags, round.course_rating, round.slope_rating, pcc);

      if (diff != null) {
        differentials.push(diff);
        breakdown.push({
          roundId: round.id,
          date: round.date,
          listingName: round.listing_name || null,
          differential: diff,
          eligible: true,
          reason: null,
        });
      } else {
        breakdown.push({
          roundId: round.id,
          date: round.date,
          listingName: round.listing_name || null,
          differential: 0,
          eligible: false,
          reason: 'could not calculate differential',
        });
      }
    } else {
      breakdown.push({
        roundId: round.id,
        date: round.date,
        listingName: round.listing_name || null,
        differential: 0,
        eligible: false,
        reason,
      });
    }
  }

  const estimate = calculateHandicapEstimate(differentials);

  return {
    estimate,
    eligibleCount: differentials.length,
    differentials: breakdown,
    lastUpdated: sorted.length > 0 ? sorted[0].date : null,
  };
}