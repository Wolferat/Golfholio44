import { useEffect, useState, useCallback } from 'react';
import { Plus, CalendarClock } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import ScheduleTeeTime from '@/components/golf/ScheduleTeeTime';
import TeeTimeListItem from '@/components/golf/TeeTimeListItem';
import { useToast } from '@/components/ui/use-toast';

export default function TeeTimes() {
  const [times, setTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await base44.entities.TeeTime.list('-date', 50);
      setTimes(all);
    } catch { setTimes([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = async (data) => {
    await base44.entities.TeeTime.create({ ...data, status: 'scheduled' });
    setOpen(false);
    toast({ title: 'Tee time scheduled' });
    await load();
  };

  const cancel = async (id) => {
    await base44.entities.TeeTime.delete(id);
    await load();
  };
  const complete = async (id) => {
    await base44.entities.TeeTime.update(id, { status: 'completed' });
    toast({ title: 'Marked as played' });
    await load();
  };

  const upcoming = times.filter((t) => t.status === 'scheduled');
  const sorted = [...upcoming].sort((a, b) => (a.date + a.time > b.date + b.time ? 1 : -1));

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Tee Times</h1>
            <p className="text-xs text-muted-foreground mt-1">Your upcoming rounds</p>
          </div>
          <CalendarClock className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={load}>
        {loading ? (
          <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl shimmer" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground px-6">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <CalendarClock className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">No tee times scheduled</p>
            <p className="text-sm mt-1">Book a tee time and invite your crew.</p>
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            {sorted.map((t) => <TeeTimeListItem key={t.id} teeTime={t} onCancel={() => cancel(t.id)} onComplete={() => complete(t.id)} />)}
          </div>
        )}
      </PullToRefresh>

      <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] inset-x-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-4 flex justify-end">
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => setOpen(true)}
            className="pointer-events-auto h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 grid place-items-center">
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>

      <ScheduleTeeTime open={open} onClose={() => setOpen(false)} onCreated={handleCreated} />
    </div>
  );
}