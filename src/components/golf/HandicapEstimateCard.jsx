import { useEffect, useState } from 'react';
import { TrendingUp, Info } from 'lucide-react';
import { getHandicapEstimate } from '@/lib/golfData';

// ============================================================
// Handicap Estimate Card — player-facing, private by default.
//
// Shows the Golfolio Handicap Estimate when enough eligible
// rounds exist, or "Add eligible rounds to build your estimate"
// when insufficient data exists.
//
// This is NOT an official USGA/WHS Handicap Index. It is an
// estimate based on logged rounds and course difficulty.
// ============================================================

export default function HandicapEstimateCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHandicapEstimate()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-4 animate-pulse">
        <div className="h-4 w-32 bg-secondary rounded mb-3" />
        <div className="h-12 w-20 bg-secondary rounded" />
      </div>
    );
  }

  const estimate = data?.estimate;
  const eligibleCount = data?.eligibleCount || 0;

  return (
    <div className="glass-card rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">Golfolio Handicap Estimate</h3>
      </div>

      {estimate != null ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-primary">{estimate.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">estimate</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Based on {eligibleCount} eligible round{eligibleCount !== 1 ? 's' : ''}.
            {data?.lastUpdated && ` Last updated ${String(data.lastUpdated).slice(0, 10)}.`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {eligibleCount > 0
            ? `${eligibleCount} eligible round${eligibleCount !== 1 ? 's' : ''} — add at least 3 to build your estimate.`
            : 'Add eligible rounds to build your estimate.'}
        </p>
      )}

      <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border">
        <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Golfolio's estimate uses your logged rounds and course difficulty. It is not an official Handicap Index.
        </p>
      </div>
    </div>
  );
}