import { motion } from 'framer-motion';
import { Calendar, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ScorecardListItem({ card, onClick }) {
  const players = card.players || [];
  const scores = card.scores || {};
  const total = (name) => Object.values(scores[name] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={onClick} className="w-full text-left rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold truncate">{card.course_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Calendar className="h-3 w-3" />{format(parseISO(card.date), 'MMM d, yyyy')}
          </div>
        </div>
        <span className={cn('text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0', card.status === 'active' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground')}>
          {card.status === 'active' ? 'Live' : 'Final'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-3 text-xs flex-wrap">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        {players.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
            {p}{scores[p] && Object.keys(scores[p]).length > 0 && <b className="text-foreground">{total(p)}</b>}
          </span>
        ))}
      </div>
    </motion.button>
  );
}