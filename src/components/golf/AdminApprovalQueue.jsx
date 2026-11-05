import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  X,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reverifyDiscoveryCandidates, reviewDiscoveryCandidate, findLocalDiscoveryCandidates } from '@/lib/golfData';

// Rejection reasons a resolved street address can fix. Everything else
// is already decided and is never re-run.
const RETRYABLE = [
  'official page did not corroborate',
  'official page does not confirm the address',
  'coordinates could not be corroborated',
  'no geocodable address',
];

function isRetryable(candidate) {
  const reason = String(candidate.private_reason || '');
  if (!RETRYABLE.some((p) => reason.startsWith(p))) return false;
  // Mirrors the server rule: only venues that still have no street
  // address are re-checked. A resolved address ends the attempt.
  const address = String(candidate.address || '');
  const hasStreet = /\b(\d{2,6})\b/.test(address) && /[a-z]{4,}/i.test(address);
  return !!candidate.official_website && !hasStreet;
}

function errText(e) {
  return (
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.data?.error ||
    e?.message ||
    'Request failed'
  );
}

export default function AdminApprovalQueue() {
  const [items, setItems] = useState([]);
  const [retryable, setRetryable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pending = await base44.entities.DiscoveryCandidate.filter(
        { status: 'pending' },
        { sort: 'distance_miles', limit: 60 }
      );
      const rejected = await base44.entities.DiscoveryCandidate.filter(
        { status: 'rejected' },
        { sort: '-created_date', limit: 200 }
      );
      setItems(pending?.items || []);
      setRetryable((rejected?.items || []).filter((c) => isRetryable(c) && c.official_website).length);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runScan = async () => {
    setBusy('scan');
    setError('');
    setNote('');
    try {
      const res = await findLocalDiscoveryCandidates({ limit: 10 });
      setNote(
        `${res.places_found} golf venues within 30 mi · ${res.awaiting_approval} new awaiting approval · ${res.duplicates} already listed · ${res.rejected} not verifiable`
      );
      await load();
    } catch (e) {
      setError(errText(e));
    }
    setBusy('');
  };

  const runReverify = async () => {
    setBusy('reverify');
    setError('');
    setNote('');
    try {
      const res = await reverifyDiscoveryCandidates({ limit: 10 });
      setNote(
        `${res.checked} re-checked · ${res.now_awaiting_approval} now awaiting approval · ${res.still_rejected} still rejected (all reasons recorded)`
      );
      await load();
    } catch (e) {
      setError(errText(e));
    }
    setBusy('');
  };

  const decide = async (candidate, action) => {
    setBusy(candidate.id);
    setError('');
    setNote('');
    try {
      await reviewDiscoveryCandidate({ candidate_id: candidate.id, action });
      setNote(
        action === 'approve'
          ? `${candidate.name} published`
          : `${candidate.name} rejected`
      );
      await load();
    } catch (e) {
      setError(`${candidate.name}: ${errText(e)}`);
    }
    setBusy('');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-6">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading proposals…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              {items.length} venue{items.length === 1 ? '' : 's'} awaiting your approval
            </div>
            <div className="text-[11px] text-muted-foreground">
              Each one passed every automated gate. Nothing is published until you approve it.
            </div>
          </div>
        </div>
        {retryable > 0 && (
          <div className="mt-3 rounded-lg bg-secondary/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">
              {retryable} venue{retryable === 1 ? '' : 's'} were rejected only because no street address
              came back. They can be re-checked now that addresses are resolved.
            </div>
            <Button
              variant="secondary"
              className="h-9 w-full mt-2"
              disabled={!!busy}
              onClick={runReverify}
            >
              {busy === 'reverify' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-check next {Math.min(10, retryable)}
            </Button>
          </div>
        )}

        <Button variant="secondary" className="h-9 w-full mt-2" disabled={!!busy} onClick={runScan}>
          {busy === 'scan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          Scan for new venues within 30 mi
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}
      {note && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
          {note}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldQuestion className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium text-foreground">Nothing to approve</p>
          <p className="text-xs mt-1">
            {retryable > 0
              ? 'Re-check the address-only rejections above.'
              : 'Every verified venue has been decided.'}
          </p>
        </div>
      ) : (
        items.map((c) => (
          <div key={c.id} className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {c.discovery_category || 'venue'}
                  {c.distance_miles != null ? ` · ${c.distance_miles} mi` : ''}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    {c.address || 'no address'}
                    {c.city ? ` · ${[c.city, c.state].filter(Boolean).join(', ')}` : ''}
                  </span>
                </div>
                {c.official_website && (
                  <a
                    href={c.official_website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary mt-1 inline-flex items-center gap-1 truncate max-w-full"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.official_website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
              </div>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border shrink-0', 'bg-rating/15 text-rating border-rating/30')}>
                verified
              </span>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1 h-9"
                disabled={!!busy}
                onClick={() => decide(c, 'approve')}
              >
                {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </Button>
              <Button
                variant="secondary"
                className="flex-1 h-9"
                disabled={!!busy}
                onClick={() => decide(c, 'reject')}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}