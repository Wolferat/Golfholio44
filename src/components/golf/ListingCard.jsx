import { motion } from 'framer-motion';
import { MapPin, Star, Heart, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const TYPE_LABEL = { course: 'Course', simulator: 'Simulator', charity: 'Tournament', training: 'Lesson' };

export default function ListingCard({ item, saved, onToggleSave, onOpen }) {
  return (
    <div className="border-b border-border">
      <motion.div
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={onOpen}
        className="cursor-pointer"
      >
        <div className="relative aspect-[16/9] fairway-gradient overflow-hidden">
          <span className="absolute top-3 left-3 rounded-full glass-card border border-border/50 px-3 py-1 text-[11px] font-semibold text-foreground">
            {TYPE_LABEL[item.type]}
          </span>
          <motion.button
            whileTap={{ scale: 0.82 }}
            onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
            aria-label={saved ? 'Unsave' : 'Save'}
            className="absolute top-3 right-3 h-10 w-10 rounded-full glass-card border border-border/50 grid place-items-center"
          >
            <motion.span animate={{ scale: saved ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.3 }}>
              <Heart className={cn('h-5 w-5', saved ? 'fill-primary text-primary' : 'text-foreground')} />
            </motion.span>
          </motion.button>
        </div>
        <div className="p-4">
          <h3 className="font-bold text-[15px] leading-tight">{item.name}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
            {item.distance != null && <span>{item.distance} mi</span>}
            {item.rating != null && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-accent" />{item.rating}</span>}
          </div>
          {item.date && (
            <div className="flex items-center gap-1.5 text-xs text-accent mt-2 font-medium">
              <Calendar className="h-3.5 w-3.5" />{format(parseISO(item.date), 'EEE, MMM d')}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}