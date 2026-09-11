import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MapPin, Star, Calendar, Globe, Navigation, Share2, Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const TYPE_LABEL = { course: 'Course', simulator: 'Simulator', charity: 'Tournament', training: 'Lesson' };

export default function ListingDetail({ item, saved, onToggleSave, onClose }) {
  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md mt-auto bg-card rounded-t-3xl border-t border-border max-h-[88dvh] overflow-y-auto no-scrollbar"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="relative h-44 fairway-gradient">
              <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/70 backdrop-blur grid place-items-center">
                <X className="h-5 w-5" />
              </button>
              <span className="absolute top-3 left-3 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-xs font-semibold">
                {TYPE_LABEL[item.type]}
              </span>
            </div>
            <div className="p-5 pb-nav">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold font-heading">{item.name}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{item.location}</span>
                    {item.rating != null && <span className="flex items-center gap-1"><Star className="h-4 w-4 text-accent" />{item.rating}</span>}
                  </div>
                </div>
                <button onClick={onToggleSave} className="shrink-0 h-11 w-11 rounded-full bg-secondary grid place-items-center active:scale-95 transition">
                  <Heart className={cn('h-5 w-5', saved ? 'fill-accent text-accent' : 'text-muted-foreground')} />
                </button>
              </div>

              {item.date && (
                <div className="mt-3 flex items-center gap-2 text-accent text-sm font-medium">
                  <Calendar className="h-4 w-4" />{format(parseISO(item.date), 'EEEE, MMMM d, yyyy')}
                </div>
              )}

              {item.blurb && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.blurb}</p>}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="h-11"><Navigation className="h-4 w-4 mr-2" />Directions</Button>
                <Button variant="secondary" className="h-11"><Share2 className="h-4 w-4 mr-2" />Share</Button>
                <Button variant="secondary" className="h-11"><Globe className="h-4 w-4 mr-2" />Website</Button>
                <Button variant="secondary" className="h-11"><Flag className="h-4 w-4 mr-2" />Report</Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}