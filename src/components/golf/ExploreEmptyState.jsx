import { MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ExploreEmptyState({ onChangeLocation }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-6 text-center"
    >
      <div className="h-12 w-12 rounded-full bg-primary/12 border border-primary/30 grid place-items-center mx-auto mb-3">
        <MapPin className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-base font-bold">No verified listings in this area yet.</h3>
      <p className="text-sm text-muted-foreground mt-1.5">Try another ZIP code or update your location.</p>
      <button
        onClick={onChangeLocation}
        className="mt-4 h-11 px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2"
      >
        <MapPin className="h-4 w-4" /> Change location
      </button>
    </motion.div>
  );
}