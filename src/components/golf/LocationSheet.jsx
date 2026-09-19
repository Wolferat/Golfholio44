import { useState, useEffect } from 'react';
import { Crosshair, Check, X, Search, MapPin } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ============================================================
// Location Sheet — GPS, city search, and ZIP search.
//
// Supports:
//   - Use my location (GPS, reverse-geocoded)
//   - Search by city and state
//   - Search by ZIP code
//   - Ambiguous city results (player chooses)
//
// After selection, the resolved city/state is displayed — not
// a raw ZIP or "Current location."
// ============================================================

export default function LocationSheet({ open, onClose, city, state, onUseGps, onSearch, onConfirm, locating, hasCoords, locationError }) {
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    if (open) {
      setDraft('');
      setResults([]);
      setSearchError(null);
    }
  }, [open]);

  const handleSearch = async () => {
    const q = draft.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const { results: r, error } = await onSearch(q);
      if (error) {
        setSearchError(error);
      } else if (r.length === 1) {
        // Single match — confirm immediately
        onConfirm(r[0]);
      } else if (r.length > 1) {
        // Ambiguous — let player choose
        setResults(r);
      } else {
        setSearchError('No matches found. Try a different city or ZIP.');
      }
    } catch {
      setSearchError('Could not search. Try again.');
    }
    setSearching(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="80dvh">
      <div className="px-5 pt-1 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold">Your location</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Use your current location or search by city or ZIP code to find verified golf nearby.
        </p>

        {/* GPS */}
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
          <div className="h-px bg-border flex-1" /> or search by city or ZIP <div className="h-px bg-border flex-1" />
        </div>

        {/* City/ZIP search */}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="City, State or ZIP"
            className="h-12 rounded-2xl"
          />
          <Button onClick={handleSearch} disabled={searching} className="h-12 rounded-2xl px-4 shrink-0">
            {searching ? <Search className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {searchError && (
          <p className="text-xs text-destructive mt-2 text-center">{searchError}</p>
        )}

        {/* Ambiguous city results — player chooses */}
        {results.length > 1 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Multiple matches — pick your city:</p>
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => onConfirm(r)}
                className="w-full h-12 rounded-2xl glass-card border border-border flex items-center gap-3 px-4 text-left"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm">{r.displayName}</span>
                <Check className="h-4 w-4 text-primary ml-auto shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Current selection */}
        {city && state && !results.length && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium">{city}, {state}</span>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full h-11 rounded-2xl glass-card border border-border text-sm font-semibold flex items-center justify-center gap-2"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </BottomSheet>
  );
}