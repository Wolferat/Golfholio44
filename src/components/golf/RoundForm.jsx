import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md mt-auto bg-card rounded-t-3xl border-t border-border max-h-[88dvh] overflow-y-auto no-scrollbar"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="p-5 pb-nav">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold font-heading">Log a Round</h2>
                <button onClick={onClose} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Holes</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {[9, 18].map((h) => (
                      <button
                        key={h}
                        onClick={() => setHoles(h)}
                        className={cn(
                          'h-11 rounded-xl border font-semibold transition',
                          holes === h ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'
                        )}
                      >
                        {h} Holes
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="score" className="text-sm text-muted-foreground">Score</Label>
                    <Input id="score" type="number" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} placeholder="92" className="mt-1.5 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="date" className="text-sm text-muted-foreground">Date</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-11" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes" className="text-sm text-muted-foreground">Notes (optional)</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it go?" className="mt-1.5" rows={3} />
                </div>
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                  <Button className="flex-1 h-11" onClick={handleSave} disabled={!score || saving}>
                    {saving ? 'Saving…' : 'Save Round'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}