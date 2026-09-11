import { motion } from 'framer-motion';
import { CalendarClock, Users, Trash2, Check } from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';

export default function TeeTimeListItem({ teeTime, onCancel, onComplete }) {
  const dt = parseISO(teeTime.date);
  return (
    <motion.div whileTap={{ scale: 0.98 }} className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-bold truncate">{teeTime.course_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <CalendarClock className="h-3 w-3" />
            {isToday(dt) ? 'Today' : format(dt, 'EEE, MMM d')} · {teeTime.time}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onComplete && (
            <button onClick={onComplete} aria-label="Mark played" className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center">
              <Check className="h-4 w-4 text-primary" />
            </button>
          )}
          <button onClick={onCancel} aria-label="Cancel" className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        {teeTime.group_size && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{teeTime.group_size} golfers</span>}
        {teeTime.notes && <span className="truncate">{teeTime.notes}</span>}
      </div>
    </motion.div>
  );
}