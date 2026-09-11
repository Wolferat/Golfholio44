import { format, parseISO } from 'date-fns';

export default function LiveTicker({ tournaments, onTap }) {
  if (!tournaments.length) return null;
  const segments = tournaments.map((t) =>
    t.live
      ? `LIVE · ${t.name}`
      : `${t.name} · ${t.startsAt ? format(parseISO(t.startsAt), 'MMM d') : 'Upcoming'}`
  );
  const track = segments.join('   •   ');
  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <span className="flex items-center gap-1.5 text-primary text-xs font-extrabold tracking-wider shrink-0">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> LIVE
      </span>
      <div className="overflow-hidden flex-1 relative">
        <div className="whitespace-nowrap animate-ticker text-sm text-foreground/90">{track}   •   {track}</div>
      </div>
    </button>
  );
}