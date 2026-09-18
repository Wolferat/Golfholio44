import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function RoundLogForm({ listingId, listingName, round, onDone }) {
  const { toast } = useToast();
  const [date, setDate] = useState(round?.date || new Date().toISOString().slice(0, 10));
  const [holes, setHoles] = useState(round?.holes || 18);
  const [score, setScore] = useState(round?.score != null ? String(round.score) : '');
  const [notes, setNotes] = useState(round?.notes || '');
  const [format, setFormat] = useState(round?.format || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const scoreNum = Number(score);
    if (!date) { toast({ title: 'Date required' }); return; }
    if (holes !== 9 && holes !== 18) { toast({ title: 'Select 9 or 18 holes' }); return; }
    if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 300) {
      toast({ title: 'Enter a valid score (1–300)' }); return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('logRound', {
        listing_id: listingId,
        listing_name: listingName,
        date,
        holes,
        score: scoreNum,
        notes: notes.trim(),
        format: format.trim(),
        ...(round?.id ? { round_id: round.id } : {}),
      });
      toast({ title: round ? 'Round updated' : 'Round logged' });
      onDone(res.data.round);
    } catch (e) {
      toast({ title: 'Could not save round', description: e?.message });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Date played</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div>
          <Label className="text-xs">Holes</Label>
          <div className="flex gap-2 mt-1">
            {[9, 18].map((h) => (
              <button
                key={h}
                onClick={() => setHoles(h)}
                className={cn(
                  'flex-1 h-10 rounded-md border font-semibold text-sm transition',
                  holes === h ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-transparent'
                )}
              >
                {h} holes
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs">Score</Label>
        <Input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="e.g. 92"
          className="h-10"
        />
      </div>
      <div>
        <Label className="text-xs">Format (optional)</Label>
        <Input
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          placeholder="e.g. Stroke play, Scramble"
          className="h-10"
        />
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How was the round?"
          className="min-h-[60px] resize-none"
          maxLength={500}
        />
      </div>
      <Button className="w-full h-12" onClick={submit} disabled={saving}>
        {saving ? 'Saving…' : round ? 'Update round' : 'Log round'}
      </Button>
    </div>
  );
}