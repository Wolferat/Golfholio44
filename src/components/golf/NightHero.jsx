import { MapPin, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';

const HERO_IMG = 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/0d7f8669e_generated_image.png';

export default function NightHero({ locationLabel, subtitle, onOpenLocation, onUseLocation, locating }) {
  return (
    <div className="relative overflow-hidden">
      <Image src={HERO_IMG} fittingType="fill" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/25 via-background/55 to-background" />
      <div className="relative px-4 pt-5 pb-3 min-h-[200px] flex flex-col justify-end">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="self-start inline-flex items-center gap-2 rounded-full glass-card border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
          Explore Top Courses
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="text-[28px] font-extrabold mt-3 leading-tight tracking-tight"
        >
          {locationLabel || 'Find golf nearby'}
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24 }}
          className="flex items-center justify-between gap-3 mt-3"
        >
          <button
            onClick={onOpenLocation}
            className="text-sm text-muted-foreground flex items-center gap-1.5 min-w-0"
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{subtitle || 'Choose location'}</span>
          </button>
          <button
            onClick={onUseLocation}
            disabled={locating}
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary glass-card border border-primary/30 rounded-full px-3 py-1.5 disabled:opacity-60"
          >
            <Crosshair className="h-3.5 w-3.5" /> {locating ? 'Locating…' : 'Use my location'}
          </button>
        </motion.div>
      </div>
    </div>
  );
}