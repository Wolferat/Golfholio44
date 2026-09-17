import { useState, useEffect } from 'react';
import { Crosshair, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LocationSheet({ open, onClose, city, onSave, onUseGps, locating, hasCoords, locationError }) {
  const [draft, setDraft] = useState(city);

  useEffect(() => { if (open) setDraft(city || ''); }, [open, city]);

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="60dvh">
      <div className="p-5">
        <h2 className="text-lg font-bold">Your location</h2>
        <p className="text-sm text-muted-foreground mt-1">Use your current location or enter a ZIP code to find verified golf nearby.</p>
        <button
          onClick={onUseGps}
          disabled={locating}
          className="mt-4 w-full h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Crosshair className="h-4 w-4" />
          {locating ? 'Locating…' : hasCoords ? 'Using current location' : 'Use my location'}
        </button>
        {locationError && (
          <p className="text-xs text-destructive mt-2 text-center">{locationError}</p>
        )}
        <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" /> or enter a ZIP code <div className="h-px bg-border flex-1" />
        </div>
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ZIP code" className="h-12 rounded-2xl" />
          <Button onClick={() => onSave(draft)} className="h-12 rounded-2xl px-4">
            <Check className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}