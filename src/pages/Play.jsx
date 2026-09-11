import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import StartScorecard from '@/components/golf/StartScorecard';
import ScorecardListItem from '@/components/golf/ScorecardListItem';

export default function Play() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await base44.entities.Scorecard.list('-created_date', 50);
      setCards(all);
    } catch { setCards([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = async (data) => {
    const created = await base44.entities.Scorecard.create({ ...data, status: 'active', scores: {} });
    setStartOpen(false);
    navigate(`/play/${created.id}`);
  };

  const active = cards.filter((c) => c.status === 'active');
  const completed = cards.filter((c) => c.status === 'completed');

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Play</h1>
            <p className="text-xs text-muted-foreground mt-1">Live scorecards & rounds</p>
          </div>
          <Flag className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={load}>
        {loading ? (
          <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}</div>
        ) : cards.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground px-6">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <Flag className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">No scorecards yet</p>
            <p className="text-sm mt-1">Start a round to track scores live with your crew.</p>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {active.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Active</h2>
                <div className="space-y-2.5">
                  {active.map((c) => <ScorecardListItem key={c.id} card={c} onClick={() => navigate(`/play/${c.id}`)} />)}
                </div>
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Completed</h2>
                <div className="space-y-2.5">
                  {completed.map((c) => <ScorecardListItem key={c.id} card={c} onClick={() => navigate(`/play/${c.id}`)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </PullToRefresh>

      <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-4 flex justify-end">
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => setStartOpen(true)}
            className="pointer-events-auto h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 grid place-items-center">
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>

      <StartScorecard open={startOpen} onClose={() => setStartOpen(false)} onCreated={handleCreated} />
    </div>
  );
}