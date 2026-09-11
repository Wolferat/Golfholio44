import { MapPin, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';

const HERO_IMG = 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/42aa12ea6_generated_image.png';

export default function NightHero({ locationLabel, subtitle, onOpenLocation, onUseLocation, locating }) {
  return (
    <div className="relative h-[300px] overflow-hidden">
      <Image src={HERO_IMG} fittingType="fill" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background" />
      <div className="absolute inset-x-0 bottom-0 p-4 pb-5">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 rounded-full glass-card border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
          Explore Top Courses
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="text-[34px] font-extrabold mt-3 leading-none tracking-tight"
        >
          {locationLabel}
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26 }}
          className="flex items-center justify-between mt-2.5"
        >
          <button onClick={onOpenLocation} className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" /> {subtitle}
          </button>
          <button
            onClick={onUseLocation}
            disabled={locating}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary glass-card border border-primary/30 rounded-full px-3 py-1.5 disabled:opacity-60"
          >
            <Crosshair className="h-3.5 w-3.5" /> {locating ? 'Locating…' : 'Use my location'}
          </button>
        </motion.div>
      </div>
    </div>
  );
}