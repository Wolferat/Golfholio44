import { useEffect, useState, useCallback } from 'react';
import { Plus, Flag, TrendingUp, Award, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassHeader from '@/components/golf/GlassHeader';
import { RoundRowSkeleton, StatCardSkeleton } from '@/components/golf/Shimmer';
import { getRounds, addRound, getRoundStats } from '@/lib/golfData';
import RoundForm from '@/components/golf/RoundForm';
import { useToast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';

export default function MyGame() {
  const [rounds, setRounds] = useState([]);
  const [stats, setStats] = useState({ count: 0, avg: null, best: null });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([getRounds(), getRoundStats()]);
    setRounds(r);
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (round) => {
    await addRound(round);
    await load();
    toast({ title: 'Round logged', description: `${round.holes} holes · ${round.score} strokes` });
  };

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">My Game</h1>
            <p className="text-xs text-muted-foreground mt-1">Your private round history</p>
          </div>
        </div>
      </GlassHeader>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {loading ? (
            [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard icon={Flag} label="Rounds" value={stats.count} />
              <StatCard icon={TrendingUp} label="Avg" value={stats.avg ?? '—'} />
              <StatCard icon={Award} label="Best" value={stats.best ?? '—'} />
            </>
          )}
        </div>

        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">History</h2>
      </div>

      {loading ? (
        <div>{[...Array(3)].map((_, i) => <RoundRowSkeleton key={i} />)}</div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground px-6">
          <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
            <Flag className="h-7 w-7 opacity-50" />
          </div>
          <p className="font-semibold text-foreground">No rounds logged yet</p>
          <p className="text-sm mt-1">Tap the + button to add your first round.</p>
        </div>
      ) : (
        <div>
          {rounds.map((r) => (
            <motion.div key={r.id} whileTap={{ scale: 0.99 }} className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <div className="h-12 w-12 rounded-xl fairway-gradient grid place-items-center shrink-0">
                <span className="text-sm font-bold text-primary-foreground">{r.holes}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[15px]">
                    {r.score} <span className="text-xs text-muted-foreground font-normal">strokes</span>
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{format(parseISO(r.date), 'MMM d, yyyy')}
                  </span>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-4 flex justify-end">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setFormOpen(true)}
            className="pointer-events-auto h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 grid place-items-center"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>

      <RoundForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3 text-center">
      <Icon className="h-4 w-4 mx-auto text-accent mb-1.5" />
      <div className="text-xl font-extrabold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}