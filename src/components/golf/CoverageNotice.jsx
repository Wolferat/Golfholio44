import { motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';

// ============================================================
// CoverageNotice — compact, dismissible notification shown at
// the top of the verified results when a real new-area coverage
// request begins. Never blocks browsing. After dismissal it does
// not re-open for the same request unless the status materially
// changes (tracked by the parent via dismissedAreaKey).
//
// Props:
//   areaLabel:  'City, State' — confirmed location
//   onDismiss:  callback when the player taps the X
// ============================================================

export default function CoverageNotice({ areaLabel, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl glass-card border border-primary/15"
    >
      <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
        We&rsquo;re verifying golf near {areaLabel}. New-area results usually begin
        appearing within 3&ndash;5 minutes. We&rsquo;ll only show places once their
        information is verified.
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground transition"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}