import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import BottomSheet from './BottomSheet';
import { cn } from '@/lib/utils';

export default function RoundForm({ open, onClose, onSave }) {
  const [holes, setHoles] = useState(18);
  const [score, setScore] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!score) return;
    setSaving(true);
    await onSave({ holes, score, date, notes });
    setSaving(false);
    setScore('');
    setNotes('');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="88dvh">
      <div className="p-5 pb-nav">
        <h2 className="text-lg font-bold mb-5">Log a Round</h2>
        <div className="space-y-5">
          <div>
            <Label className="text-sm text-muted-foreground">Holes</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[9, 18].map((h) => (
                <motion.button
                  key={h}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setHoles(h)}
                  className={cn(
                    'h-12 rounded-xl border font-semibold transition',
                    holes === h ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'
                  )}
                >
                  {h} Holes
                </motion.button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="score" className="text-sm text-muted-foreground">Score</Label>
              <Input id="score" type="number" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} placeholder="92" className="mt-2 h-12 text-base" />
            </div>
            <div>
              <Label htmlFor="date" className="text-sm text-muted-foreground">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 h-12 text-base" />
            </div>
          </div>
          <div>
            <Label htmlFor="notes" className="text-sm text-muted-foreground">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it go?" className="mt-2" rows={3} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 h-12" onClick={handleSave} disabled={!score || saving}>
              {saving ? 'Saving…' : 'Save Round'}
            </Button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}