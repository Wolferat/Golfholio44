import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag, CalendarClock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import StartScorecard from '@/components/golf/StartScorecard';
import ScheduleTeeTime from '@/components/golf/ScheduleTeeTime';
import ScorecardListItem from '@/components/golf/ScorecardListItem';
import TeeTimeListItem from '@/components/golf/TeeTimeListItem';
import { useToast } from '@/components/ui/use-toast';

const playerTotal = (card, name) =>
  Object.values((card.scores || {})[name] || {}).reduce((a, b) => a + (Number(b) || 0), 0);

export default function Play() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cards, setCards] = useState([]);
  const [times, setTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [teeOpen, setTeeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        base44.entities.Scorecard.list('-created_date', 50),
        base44.entities.TeeTime.list('-date', 50),
      ]);
      setCards(c);
      setTimes(t);
    } catch {
      setCards([]);
      setTimes([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = async (data) => {
    const created = await base44.entities.Scorecard.create({ ...data, status: 'active', scores: {} });
    setStartOpen(false);
    navigate(`/play/${created.id}`);
  };

  const handleTeeCreated = async (data) => {
    await base44.entities.TeeTime.create({ ...data, status: 'scheduled' });
    setTeeOpen(false);
    toast({ title: 'Tee time scheduled' });
    await load();
  };

  const cancelTee = async (id) => {
    await base44.entities.TeeTime.delete(id);
    await load();
  };
  const completeTee = async (id) => {
    await base44.entities.TeeTime.update(id, { status: 'completed' });
    toast({ title: 'Marked as played' });
    await load();
  };

  const active = cards.filter((c) => c.status === 'active');
  const completed = cards.filter((c) => c.status === 'completed');
  const upcoming = times
    .filter((t) => t.status === 'scheduled')
    .sort((a, b) => (a.date + a.time > b.date + b.time ? 1 : -1));

  const myTotals = completed.map((c) => playerTotal(c, c.players?.[0])).filter((n) => n > 0);
  const rounds = myTotals.length;
  const avg = rounds ? Math.round(myTotals.reduce((a, b) => a + b, 0) / rounds) : null;
  const best = rounds ? Math.min(...myTotals) : null;

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Play</h1>
            <p className="text-xs text-muted-foreground mt-1">Scorecards & tee times</p>
          </div>
          <Flag className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={load}>
        <div className="p-4 space-y-5">
          {/* summary tile */}
          <div className="glass-card rounded-2xl border border-border p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-2xl font-extrabold text-primary">{rounds || '—'}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Rounds</div>
              </div>
              <div className="border-x border-border">
                <div className="text-2xl font-extrabold">{avg ?? '—'}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Avg</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold">{best ?? '—'}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Best</div>
              </div>
            </div>
          </div>

          {/* two action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStartOpen(true)}
              className="h-14 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30">
              <Flag className="h-5 w-5" /> Start a Round
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setTeeOpen(true)}
              className="h-14 rounded-2xl glass-card border border-border font-bold flex items-center justify-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> Schedule Tee Time
            </motion.button>
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl shimmer" />)}</div>
          ) : (
            <>
              {active.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Active Rounds</h2>
                  <div className="space-y-2.5">
                    {active.map((c) => <ScorecardListItem key={c.id} card={c} onClick={() => navigate(`/play/${c.id}`)} />)}
                  </div>
                </div>
              )}

              {upcoming.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Upcoming Tee Times</h2>
                    <button onClick={() => navigate('/tee-times')} className="text-xs font-semibold text-primary inline-flex items-center">View all <ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="space-y-2.5">
                    {upcoming.slice(0, 3).map((t) => (
                      <TeeTimeListItem key={t.id} teeTime={t} onCancel={() => cancelTee(t.id)} onComplete={() => completeTee(t.id)} />
                    ))}
                  </div>
                </div>
              )}

              {completed.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Past Rounds</h2>
                  <div className="space-y-2.5">
                    {completed.map((c) => <ScorecardListItem key={c.id} card={c} onClick={() => navigate(`/play/${c.id}`)} />)}
                  </div>
                </div>
              )}

              {active.length === 0 && upcoming.length === 0 && completed.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
                    <Flag className="h-7 w-7 opacity-50" />
                  </div>
                  <p className="font-semibold text-foreground">No rounds yet</p>
                  <p className="text-sm mt-1">Start a round or schedule a tee time to get going.</p>
                </div>
              )}
            </>
          )}
        </div>
      </PullToRefresh>

      <StartScorecard open={startOpen} onClose={() => setStartOpen(false)} onCreated={handleCreated} />
      <ScheduleTeeTime open={teeOpen} onClose={() => setTeeOpen(false)} onCreated={handleTeeCreated} />
    </div>
  );
}