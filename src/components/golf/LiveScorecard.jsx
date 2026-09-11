import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Share2, Check, Minus, Plus, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import GlassHeader from './GlassHeader';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const fmtDelta = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

export default function LiveScorecard({ cardId, onBack }) {
  const [card, setCard] = useState(null);
  const [hole, setHole] = useState(1);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    base44.entities.Scorecard.get(cardId).then((c) => {
      if (mounted) { setCard(c); setLoading(false); }
    }).catch(() => { if (mounted) setLoading(false); });
    const unsub = base44.entities.Scorecard.subscribe((event) => {
      if (event.id === cardId) setCard(event.data);
    });
    return () => { mounted = false; unsub(); };
  }, [cardId]);

  if (loading) {
    return <div className="flex items-center justify-center h-dvh"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!card) {
    return <div className="text-center py-24 text-muted-foreground px-6">
      <p className="font-medium text-foreground">Scorecard not found</p>
      <Button variant="secondary" className="mt-4" onClick={onBack}>Back to Play</Button>
    </div>;
  }

  const holes = card.holes || 18;
  const players = card.players || [];
  const scores = card.scores || {};
  const pars = card.pars && card.pars.length ? card.pars : null;
  const readOnly = card.status === 'completed';

  const getStrokes = (name, h) => scores[name]?.[String(h)] ?? null;
  const setStrokes = async (name, h, value) => {
    if (readOnly) return;
    const next = { ...scores, [name]: { ...(scores[name] || {}), [String(h)]: value } };
    setCard({ ...card, scores: next });
    await base44.entities.Scorecard.update(cardId, { scores: next });
  };
  const totalFor = (name) => Object.values(scores[name] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const vsParFor = (name) => {
    if (!pars) return null;
    let d = 0;
    for (const [hStr, s] of Object.entries(scores[name] || {})) {
      const p = pars[Number(hStr) - 1];
      if (p != null && s != null) d += Number(s) - p;
    }
    return d;
  };
  const holesPlayedFor = (name) => Object.keys(scores[name] || {}).length;

  const primary = players[0];
  const played = primary ? holesPlayedFor(primary) : 0;
  const progress = Math.min((played / holes) * 100, 100);
  const isLast = hole >= holes;

  const share = () => {
    const url = `${window.location.origin}/play/${cardId}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: 'Share it so your crew can follow live.' });
  };
  const complete = async () => {
    await base44.entities.Scorecard.update(cardId, { status: 'completed' });
    onBack?.();
  };
  const next = () => setHole((h) => Math.min(h + 1, holes));

  return (
    <div className="pb-40">
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <button onClick={onBack} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center min-w-0">
            <div className="text-sm font-bold leading-none truncate max-w-[180px]">{card.course_name}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{readOnly ? 'Final' : 'Live'} · Hole {hole}/{holes}</div>
          </div>
          <button onClick={share} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </GlassHeader>

      {/* progress bar */}
      <div className="px-4 pt-3">
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
      </div>

      {/* hole selector */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 border-b border-border">
        {Array.from({ length: holes }, (_, i) => i + 1).map((h) => (
          <button key={h} onClick={() => setHole(h)}
            className={cn('h-10 w-10 rounded-full text-sm font-semibold shrink-0 border transition',
              h === hole ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground')}>
            {h}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-2.5">
        {pars && <div className="text-center text-xs text-muted-foreground mb-1">Par {pars[hole - 1] ?? '—'}</div>}
        {players.map((name) => {
          const strokes = getStrokes(name, hole);
          const delta = vsParFor(name);
          return (
            <div key={name} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{totalFor(name)} thru {holesPlayedFor(name)}</span>
                  {delta != null && <span className={cn('font-semibold', delta > 0 ? 'text-destructive' : delta < 0 ? 'text-primary' : 'text-muted-foreground')}>{fmtDelta(delta)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <motion.button whileTap={{ scale: 0.85 }} disabled={readOnly} onClick={() => setStrokes(name, hole, Math.max(0, (strokes ?? 0) - 1))}
                  className="h-10 w-10 rounded-full bg-secondary grid place-items-center disabled:opacity-50">
                  <Minus className="h-5 w-5" />
                </motion.button>
                <div className="w-10 text-center text-2xl font-extrabold">{strokes ?? '–'}</div>
                <motion.button whileTap={{ scale: 0.85 }} disabled={readOnly} onClick={() => setStrokes(name, hole, (strokes ?? 0) + 1)}
                  className="h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-50">
                  <Plus className="h-5 w-5" />
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Leaderboard</h2>
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          {[...players].sort((a, b) => totalFor(a) - totalFor(b)).map((name, i) => {
            const delta = vsParFor(name);
            return (
              <div key={name} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}>
                <span className={cn('h-6 w-6 rounded-full grid place-items-center text-xs font-bold', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>{i + 1}</span>
                <span className="flex-1 font-medium truncate">{name}</span>
                {delta != null && <span className={cn('text-xs font-semibold', delta > 0 ? 'text-destructive' : delta < 0 ? 'text-primary' : 'text-muted-foreground')}>{fmtDelta(delta)}</span>}
                <span className="font-bold">{totalFor(name)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* sticky bottom action bar */}
      <div className="fixed inset-x-0 z-40" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-md mx-auto glass border-t border-border rounded-t-2xl">
          <div className="h-16 px-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">Hole {hole}/{holes}</div>
              <div className="font-bold text-sm truncate">
                {primary ? `${totalFor(primary)}${vsParFor(primary) != null ? ` · ${fmtDelta(vsParFor(primary))}` : ''}` : '—'}
              </div>
            </div>
            {readOnly ? (
              <Button variant="secondary" className="h-11 px-5" onClick={onBack}>Done</Button>
            ) : isLast ? (
              <Button className="h-11 px-5" onClick={complete}><Check className="h-4 w-4" /> Finish Round</Button>
            ) : (
              <Button className="h-11 px-5" onClick={next}>Next Hole <ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}