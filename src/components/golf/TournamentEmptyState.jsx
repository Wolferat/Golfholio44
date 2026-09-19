import { Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

// ============================================================
// TournamentEmptyState — honest empty state when no verified
// tournaments exist near the chosen location. Never shows weak
// leads, generic businesses, cached results, or fake events.
// ============================================================

export default function TournamentEmptyState({ onChangeLocation }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl glass-card border border-border p-6 text-center"
    >
      <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-3">
        <Trophy className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-base font-bold mb-1">No verified tournaments nearby</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We only show tournaments from verified, source-backed organizers.
        Try a different location or check back as new events are verified.
      </p>
      {onChangeLocation && (
        <button
          onClick={onChangeLocation}
          className="mt-4 text-sm font-semibold text-primary hover:underline"
        >
          Change location
        </button>
      )}
    </motion.div>
  );
}