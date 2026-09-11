import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

export default function StartScorecard({ open, onClose, onCreated }) {
  const { user } = useAuth();
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [holes, setHoles] = useState(18);
  const [players, setPlayers] = useState([user?.full_name || 'Me']);
  const [saving, setSaving] = useState(false);

  const addPlayer = () => setPlayers((p) => (p.length < 4 ? [...p, ''] : p));
  const removePlayer = (i) => setPlayers((p) => p.filter((_, idx) => idx !== i));
  const setPlayer = (i, v) => setPlayers((p) => p.map((x, idx) => (idx === i ? v : x)));

  const handleCreate = async () => {
    if (!courseName.trim()) return;
    const clean = players.map((p) => p.trim()).filter(Boolean);
    if (!clean.length) return;
    setSaving(true);
    await onCreated({ course_name: courseName.trim(), date, holes, players: clean });
    setSaving(false);
    setCourseName('');
    setPlayers([user?.full_name || 'Me']);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="90dvh">
      <div className="p-5 pb-nav">
        <h2 className="text-lg font-bold mb-5">Start a Scorecard</h2>
        <div className="space-y-5">
          <div>
            <Label className="text-sm text-muted-foreground">Course</Label>
            <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Course name" className="mt-2 h-12 text-base" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-12 text-base" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Holes</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[9, 18].map((h) => (
                  <motion.button key={h} whileTap={{ scale: 0.96 }} onClick={() => setHoles(h)}
                    className={cn('h-12 rounded-xl border font-semibold', holes === h ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border')}>
                    {h}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Players</Label>
              {players.length < 4 && (
                <button onClick={addPlayer} className="text-sm font-semibold text-primary inline-flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add
                </button>
              )}
            </div>
            <div className="space-y-2 mt-2">
              {players.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={p} onChange={(e) => setPlayer(i, e.target.value)} placeholder={`Player ${i + 1}`} className="h-12 text-base" />
                  {players.length > 1 && (
                    <button onClick={() => removePlayer(i)} className="h-12 w-12 rounded-xl bg-secondary grid place-items-center shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 h-12" onClick={handleCreate} disabled={!courseName.trim() || saving}>
              {saving ? 'Starting…' : 'Start Round'}
            </Button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}