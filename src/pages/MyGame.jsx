import { useEffect, useState, useCallback } from 'react';
import { Plus, Flag, TrendingUp, Award, Calendar } from 'lucide-react';
import { getRounds, addRound, getRoundStats } from '@/lib/golfData';
import { Button } from '@/components/ui/button';
import RoundForm from '@/components/golf/RoundForm';
import { format, parseISO } from 'date-fns';

export default function MyGame() {
  const [rounds, setRounds] = useState([]);
  const [stats, setStats] = useState({ count: 0, avg: null, best: null });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

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
  };

  return (
    <div className="safe-top px-4 pt-4">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold font-heading">My Game</h1>
          <p className="text-sm text-muted-foreground">Your private round history</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="h-11 rounded-xl">
          <Plus className="h-5 w-5 mr-1" />Round
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <StatCard icon={Flag} label="Rounds" value={stats.count} />
        <StatCard icon={TrendingUp} label="Avg" value={stats.avg ?? '—'} />
        <StatCard icon={Award} label="Best" value={stats.best ?? '—'} />
      </div>

      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">History</h2>
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />)}
        </div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Flag className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No rounds logged yet.</p>
          <p className="text-xs mt-1">Tap "Round" to add your first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <div key={r.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg fairway-gradient grid place-items-center shrink-0">
                <span className="text-sm font-bold text-primary-foreground">{r.holes}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {r.score} <span className="text-xs text-muted-foreground font-normal">strokes</span>
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{format(parseISO(r.date), 'MMM d, yyyy')}
                  </span>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoundForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 text-center">
      <Icon className="h-4 w-4 mx-auto text-accent mb-1" />
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}