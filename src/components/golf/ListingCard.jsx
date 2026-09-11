import { MapPin, Star, Heart, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const TYPE_LABEL = { course: 'Course', simulator: 'Simulator', event: 'Event' };

export default function ListingCard({ item, saved, onToggleSave, onOpen }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative h-36 fairway-gradient">
          <span className="absolute top-2.5 left-2.5 rounded-full bg-background/70 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-foreground">
            {TYPE_LABEL[item.type]}
          </span>
        </div>
      </button>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onOpen} className="text-left flex-1 min-w-0">
            <h3 className="font-semibold text-foreground leading-tight truncate">{item.name}</h3>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.location}</span>
              {item.distance != null && <span>{item.distance} mi</span>}
              {item.rating != null && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-accent" />{item.rating}</span>}
            </div>
            {item.date && (
              <div className="flex items-center gap-1 text-xs text-accent mt-1">
                <Calendar className="h-3.5 w-3.5" />{format(parseISO(item.date), 'EEE, MMM d')}
              </div>
            )}
          </button>
          <button
            onClick={onToggleSave}
            aria-label={saved ? 'Unsave' : 'Save'}
            className="shrink-0 h-9 w-9 rounded-full grid place-items-center bg-secondary active:scale-95 transition"
          >
            <Heart className={cn('h-5 w-5', saved ? 'fill-accent text-accent' : 'text-muted-foreground')} />
          </button>
        </div>
      </div>
    </div>
  );
}