import { Heart, MapPin, Star, Calendar, Globe, Navigation, X, Phone, DollarSign } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const TYPE_LABEL = { course: 'Course', simulator: 'Simulator', tournament: 'Tournament', lesson: 'Lesson' };

export default function ListingDetail({ item, saved, onToggleSave, onClose }) {
  const directionsUrl = item
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.location || item.name)}`
    : '#';

  return (
    <BottomSheet open={!!item} onClose={onClose} maxHeight="85dvh">
      {item && (
        <div>
          <div className="relative h-[260px] overflow-hidden">
            {item.photo ? (
              <Image src={item.photo} fittingType="fill" className="absolute inset-0 h-full w-full" />
            ) : (
              <div className="absolute inset-0 fairway-gradient" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <button onClick={onClose} className="absolute top-3 right-3 h-10 w-10 rounded-full glass-card border border-border/50 grid place-items-center">
              <X className="h-5 w-5" />
            </button>
            <span className="absolute top-3 left-3 rounded-full glass-card border border-border/50 px-3 py-1 text-xs font-semibold">
              {TYPE_LABEL[item.type]}
            </span>
          </div>

          <div className="p-5">
            <h2 className="text-xl font-bold">{item.name}</h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1.5 flex-wrap">
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{item.location}</span>
              {item.rating != null && <span className="flex items-center gap-1"><Star className="h-4 w-4 text-accent" />{item.rating}</span>}
            </div>

            {item.date && (
              <div className="mt-3 flex items-center gap-2 text-accent text-sm font-medium">
                <Calendar className="h-4 w-4" />{format(parseISO(item.date), 'EEEE, MMMM d, yyyy')}
              </div>
            )}

            {item.blurb && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.blurb}</p>}

            <div className="mt-4 grid grid-cols-1 gap-2">
              {item.price && (
                <div className="flex items-start gap-2.5 rounded-xl bg-secondary/50 p-3">
                  <DollarSign className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{item.price}</span>
                </div>
              )}
              {item.phone && (
                <a href={`tel:${item.phone}`} className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
                  <Phone className="h-4 w-4 text-accent shrink-0" />
                  <span className="text-sm text-foreground">{item.phone}</span>
                </a>
              )}
              {item.address && (
                <div className="flex items-start gap-2.5 rounded-xl bg-secondary/50 p-3">
                  <MapPin className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{item.address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 glass border-t border-border p-3 pb-[calc(12px+env(safe-area-inset-bottom))] grid grid-cols-3 gap-2">
            <a href={directionsUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" className="h-12 w-full"><Navigation className="h-4 w-4" />Directions</Button>
            </a>
            {item.website ? (
              <a href={item.website} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="h-12 w-full"><Globe className="h-4 w-4" />Website</Button>
              </a>
            ) : (
              <Button variant="secondary" className="h-12 w-full" disabled><Globe className="h-4 w-4" />Website</Button>
            )}
            <Button className="h-12" onClick={onToggleSave}>
              <Heart className={cn('h-4 w-4', saved && 'fill-current')} />
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}