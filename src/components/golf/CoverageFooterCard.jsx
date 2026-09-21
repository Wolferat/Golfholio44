import { motion } from 'framer-motion';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// ============================================================
// CoverageFooterCard — one quiet final card at the bottom of
// the real verified results list while coverage is queued or
// checking. Also renders a failed variant with a server-rate-
// limited retry button.
//
// This must NOT resemble a listing, skeleton, ad, or fake result.
// It is a minimal centered text line — no image, no card chrome,
// no bold title.
//
// Props:
//   status:    'queued' | 'checking' | 'failed'
//   areaLabel: 'City, State'
//   onRetry:   callback for the retry button (failed variant)
//   retrying:  boolean — retry in flight
// ============================================================

export default function CoverageFooterCard({ status, areaLabel, onRetry, retrying }) {
  if (status === 'queued' || status === 'checking') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-4 flex items-center justify-center gap-2 py-2 text-center"
      >
        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Golfolio is checking for additional verified places near {areaLabel}.
        </p>
      </motion.div>
    );
  }

  if (status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-4 flex flex-col items-center gap-1.5 py-2 text-center"
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            We couldn&rsquo;t complete coverage for {areaLabel} yet.
          </p>
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </motion.div>
    );
  }

  return null;
}