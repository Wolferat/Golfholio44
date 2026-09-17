import { MapPin, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LocationChoicePrompt({ onUseLocation, onEnterZip, locating }) {
  return (
    <div className="px-4 mt-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 text-center"
      >
        <div className="h-14 w-14 rounded-full bg-primary/15 border border-primary/30 grid place-items-center mx-auto mb-4">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold">Choose a location</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Choose a location to see verified golf nearby.</p>
        <div className="mt-5 space-y-2.5">
          <button
            onClick={onUseLocation}
            disabled={locating}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Crosshair className="h-4 w-4" />
            {locating ? 'Locating…' : 'Use my location'}
          </button>
          <button
            onClick={onEnterZip}
            className="w-full h-12 rounded-2xl glass-card border border-border text-foreground font-semibold flex items-center justify-center gap-2"
          >
            <MapPin className="h-4 w-4 text-primary" />
            Enter ZIP code
          </button>
        </div>
      </motion.div>
    </div>
  );
}