import { useState } from 'react';
import { motion } from 'framer-motion';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function ScheduleTeeTime({ open, onClose, onCreated }) {
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('08:00');
  const [groupSize, setGroupSize] = useState(4);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!courseName.trim()) return;
    setSaving(true);
    await onCreated({ course_name: courseName.trim(), date, time, group_size: groupSize, notes });
    setSaving(false);
    setCourseName('');
    setNotes('');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="90dvh">
      <div className="p-5 pb-nav">
        <h2 className="text-lg font-bold mb-5">Schedule a Tee Time</h2>
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
              <Label className="text-sm text-muted-foreground">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 h-12 text-base" />
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Group size</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[1, 2, 3, 4].map((n) => (
                <motion.button key={n} whileTap={{ scale: 0.94 }} onClick={() => setGroupSize(n)}
                  className={cn('h-12 rounded-xl border font-semibold', groupSize === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border')}>
                  {n}
                </motion.button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cart rental, who's coming…" className="mt-2" rows={2} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 h-12" onClick={handleCreate} disabled={!courseName.trim() || saving}>
              {saving ? 'Saving…' : 'Schedule'}
            </Button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}