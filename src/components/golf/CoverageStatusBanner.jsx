import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';

// ============================================================
// CoverageStatusBanner — honest new-area coverage message.
//
// Shows when a player searches an area with no completed
// coverage. Never shows a fake countdown. Never shows raw
// candidates or pending records.
//
// Props:
//   status:     'queued' | 'checking' | 'failed'
//   areaLabel:   'City, State' — confirmed location
//   hasResults:  boolean — whether verified results already exist
// ============================================================

export default function CoverageStatusBanner({ status, areaLabel, hasResults }) {
  if (status === 'queued' || status === 'checking') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card border border-primary/20 rounded-2xl p-4"
      >
        <div className="flex items-start gap-3">
          <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              We&rsquo;re verifying golf near {areaLabel}.
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {hasResults
                ? "More results may appear as additional venues are verified."
                : "New-area results usually begin appearing within 3\u20135 minutes. We'll only show places once their information is verified."}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card border border-destructive/20 rounded-2xl p-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              We couldn&rsquo;t verify golf listings for {areaLabel} right now.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Please try again later. We only show places once their information is verified.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}