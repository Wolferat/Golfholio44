import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Notification list item — private to the player. Shows a safe
// city/state label and deep-links to the policy-gated Explore feed
// when tapped. Never displays raw candidates, source URLs, audit
// info, coordinates, or internal errors.
export default function NotificationItem({ item, onTap, onClear }) {
  return (
    <div
      onClick={onTap}
      className={cn(
        'rounded-2xl border p-4 cursor-pointer transition',
        item.read ? 'glass-card border-border' : 'bg-primary/5 border-primary/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {!item.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
            <h3 className="font-bold text-sm truncate">{item.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
          {item.city && item.state && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {item.city}, {item.state}
            </div>
          )}
          {item.created_date && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {formatDistanceToNow(new Date(item.created_date), { addSuffix: true })}
            </p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="h-8 w-8 rounded-full bg-secondary/60 grid place-items-center shrink-0 text-muted-foreground hover:text-foreground transition"
          aria-label="Clear notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}