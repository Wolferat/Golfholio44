// ============================================================
// Coverage Area — shared helpers for the server-controlled,
// deduplicated coverage-request system.
//
// areaKey:   normalizes lat/lng to a grid cell so many players
//            searching the same city share one coverage request.
// backoff:   exponential backoff for re-checking an area.
// rateLimit: per-player abuse control (max new areas per hour).
//
// No player-facing function imports this directly. It is used by
// requestCoverage, getCoverageStatus, and runCoverageDiscovery.
// ============================================================

// Grid cell size: ~0.1 degree ≈ 7 miles at mid-latitudes.
// Players searching within the same cell share one coverage request.
// This prevents repeated searches from repeatedly spending API budget.
export function areaKey(lat: number, lng: number): string {
  const gridLat = Math.round(lat * 10) / 10;
  const gridLng = Math.round(lng * 10) / 10;
  return `us-${gridLat.toFixed(1)}-${gridLng.toFixed(1)}`;
}

// Exponential backoff: 5 min base, 1 hour max.
// retryCount 0 → 5 min, 1 → 10 min, 2 → 20 min, 3 → 40 min, 4+ → 60 min.
export function computeBackoff(retryCount: number): number {
  const baseMs = 5 * 60 * 1000;
  const maxMs = 60 * 60 * 1000;
  return Math.min(baseMs * Math.pow(2, retryCount), maxMs);
}

// Per-player abuse control: max 5 NEW coverage requests per hour.
// Joining an existing request does NOT count against this limit.
export const PLAYER_MAX_NEW_PER_HOUR = 5;

export function isWithinPlayerRateLimit(recentNewCount: number): boolean {
  return recentNewCount < PLAYER_MAX_NEW_PER_HOUR;
}

// Safe coverage status for player UI. Strips all internal/audit data.
export function safeCoverageStatus(coverage: any): {
  status: string;
  areaLabel: string | null;
  verifiedCount: number;
  areaKey: string | null;
} {
  if (!coverage) {
    return { status: 'none', areaLabel: null, verifiedCount: 0, areaKey: null };
  }
  return {
    status: coverage.status || 'none',
    areaLabel: coverage.area_label || null,
    verifiedCount: coverage.verified_count || 0,
    areaKey: coverage.area_key || null,
  };
}