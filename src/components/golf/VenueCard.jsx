import { motion } from 'framer-motion';
import { Heart, Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Image } from '@/components/ui/image';
import CategoryPlaceholder from './CategoryPlaceholder';

const TYPE_LABEL = { course: 'Course', simulator: 'Simulator', tournament: 'Tournament', lesson: 'Lesson' };

export default function VenueCard({ item, saved, onToggleSave, onOpen, index = 0 }) {
  const photo = item.photo;
  return (
    <motion.article
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: Math.min(index * 0.06, 0.4) }}
      onClick={onOpen}
      className="cursor-pointer rounded-2xl overflow-hidden border border-border bg-card relative shadow-lg shadow-black/40"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {photo ? (
          <Image src={photo} fittingType="fill" className="absolute inset-0 h-full w-full" />
        ) : (
          <CategoryPlaceholder className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 rounded-full glass border border-border/40 px-2.5 py-1 text-[11px] font-bold text-foreground">
          {TYPE_LABEL[item.type] || item.type}
        </span>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          aria-label={saved ? 'Unsave' : 'Save'}
          className="absolute top-3 right-3 h-9 w-9 rounded-full glass border border-border/40 grid place-items-center"
        >
          <Heart className={cn('h-4 w-4 transition-colors', saved ? 'fill-primary text-primary' : 'text-foreground')} />
        </motion.button>
      </div>
      <div className="p-3.5">
        <h3 className="font-bold text-[15px] leading-tight">{item.name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 flex-wrap">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>
          {item.distance != null && <span className="text-primary font-semibold">{item.distance} mi</span>}
        </div>
        {item.rating != null && (
          <div className="flex items-center gap-1 text-xs text-rating font-semibold mt-1.5">
            <Star className="h-3 w-3" /> {item.rating}
          </div>
        )}
      </div>
    </motion.article>
  );
}