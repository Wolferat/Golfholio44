import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

// ============================================================
// Round Log Form — mobile-first single-column layout.
//
// Field order:
//   1. date played
//   2. holes played
//   3. score
//   4. tee/rating information (optional, for Handicap Estimate)
//   5. optional format
//   6. optional notes
//   7. handicap-estimate information
//   8. submit/cancel actions
//
// Date and holes stack vertically (no 2-column grid that could
// compress on narrow phones). Tee/rating uses a responsive grid
// that stacks on narrow screens. Safe-area bottom padding
// prevents the bottom nav from covering the submit button.
// ============================================================

export default function RoundLogForm({ listingId, listingName, round, onDone }) {
  const { toast } = useToast();
  const [courseName, setCourseName] = useState(round?.course_name || round?.listing_name || '');
  const [date, setDate] = useState(round?.date || new Date().toISOString().slice(0, 10));
  const [holes, setHoles] = useState(round?.holes || 18);
  const [score, setScore] = useState(round?.score != null ? String(round.score) : '');
  const [teeName, setTeeName] = useState(round?.tee_name || '');
  const [par, setPar] = useState(round?.par != null ? String(round.par) : '');
  const [courseRating, setCourseRating] = useState(round?.course_rating != null ? String(round.course_rating) : '');
  const [slopeRating, setSlopeRating] = useState(round?.slope_rating != null ? String(round.slope_rating) : '');
  const [notes, setNotes] = useState(round?.notes || '');
  const [format, setFormat] = useState(round?.format || '');
  const [saving, setSaving] = useState(false);
  const isManual = !listingId;

  const hasRatings = !!(courseRating && slopeRating);
  const handicapEligible = holes === 18 && hasRatings;

  const submit = async () => {
    const scoreNum = Number(score);
    if (isManual && !courseName.trim()) { toast({ title: 'Course or venue name required' }); return; }
    if (!date) { toast({ title: 'Date required' }); return; }
    if (holes !== 9 && holes !== 18) { toast({ title: 'Select 9 or 18 holes' }); return; }
    if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 300) {
      toast({ title: 'Enter a valid score (1–300)' }); return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('logRound', {
        listing_id: listingId || undefined,
        listing_name: listingName,
        course_name: isManual ? courseName.trim() : undefined,
        date,
        holes,
        score: scoreNum,
        notes: notes.trim(),
        format: format.trim(),
        tee_name: teeName.trim() || undefined,
        par: par ? Number(par) : undefined,
        course_rating: courseRating ? Number(courseRating) : undefined,
        slope_rating: slopeRating ? Number(slopeRating) : undefined,
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
    <div className="space-y-4">
      {/* 0. Course/venue name (manual unlinked rounds only) */}
      {isManual && (
        <div>
          <Label className="text-xs font-semibold mb-1.5 block">Course or venue name</Label>
          <Input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="e.g. Pine Crest Golf Links"
            className="h-12"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Unlinked rounds count toward your personal stats but aren't tied to a verified listing.
          </p>
        </div>
      )}

      {/* 1. Date played */}
      <div>
        <Label className="text-xs font-semibold mb-1.5 block">Date played</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-12"
          max={new Date().toISOString().slice(0, 10)}
        />
      </div>

      {/* 2. Holes played */}
      <div>
        <Label className="text-xs font-semibold mb-1.5 block">Holes played</Label>
        <div className="flex gap-2">
          {[9, 18].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHoles(h)}
              className={cn(
                'flex-1 h-12 rounded-xl border font-semibold text-sm transition',
                holes === h ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-transparent'
              )}
            >
              {h} holes
            </button>
          ))}
        </div>
      </div>

      {/* 3. Score */}
      <div>
        <Label className="text-xs font-semibold mb-1.5 block">Score</Label>
        <Input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="e.g. 92"
          className="h-12"
        />
      </div>

      {/* 4. Tee/rating information (optional, for Handicap Estimate) */}
      <div className="rounded-xl border border-border p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Tee & Rating (optional — for Handicap Estimate)</p>
        <div>
          <Label className="text-xs mb-1 block">Tee name/color</Label>
          <Input
            value={teeName}
            onChange={(e) => setTeeName(e.target.value)}
            placeholder="e.g. Blue, White, Gold"
            className="h-10"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Par</Label>
            <Input
              type="number"
              value={par}
              onChange={(e) => setPar(e.target.value)}
              placeholder="72"
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Course Rating</Label>
            <Input
              type="number"
              step="0.1"
              value={courseRating}
              onChange={(e) => setCourseRating(e.target.value)}
              placeholder="71.3"
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Slope Rating</Label>
            <Input
              type="number"
              value={slopeRating}
              onChange={(e) => setSlopeRating(e.target.value)}
              placeholder="132"
              className="h-10"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter ratings from the official scorecard. Never guess or estimate these values.
        </p>
      </div>

      {/* 5. Optional format */}
      <div>
        <Label className="text-xs font-semibold mb-1.5 block">Format (optional)</Label>
        <Input
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          placeholder="e.g. Stroke play, Scramble"
          className="h-12"
        />
      </div>

      {/* 6. Optional notes */}
      <div>
        <Label className="text-xs font-semibold mb-1.5 block">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How was the round?"
          className="min-h-[80px] resize-none"
          maxLength={500}
        />
      </div>

      {/* 7. Handicap-estimate information */}
      <div className="flex items-start gap-2 rounded-xl bg-secondary/50 p-3">
        <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {handicapEligible
            ? 'This round is eligible for your Golfolio Handicap Estimate.'
            : holes === 9
            ? '9-hole rounds are saved for your personal stats but do not count toward the 18-hole Handicap Estimate.'
            : !hasRatings
            ? 'Add Course Rating and Slope Rating from the scorecard to make this round count toward your Handicap Estimate.'
            : 'This round is not eligible for the Handicap Estimate.'}
        </p>
      </div>

      {/* 8. Submit/cancel actions */}
      <div className="flex flex-col gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button className="w-full h-12" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : round ? 'Update round' : 'Log round'}
        </Button>
      </div>
    </div>
  );
}