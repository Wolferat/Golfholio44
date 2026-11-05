import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { reverifyDiscoveryCandidates, reviewDiscoveryCandidate, findLocalDiscoveryCandidates } from '@/lib/golfData';
import ApprovalCandidateCard from '@/components/golf/ApprovalCandidateCard';

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

// A rejection enrichment cannot change: never worth a re-check.
const DECIDED = [
  'non-golf business signal',
  'out of scope',
  'excluded business type',
  'adult/unsafe',
  'out of import radius',
  'venue appears closed',
];

function isDecided(candidate) {
  const reason = String(candidate.private_reason || '');
  return DECIDED.some((p) => reason.startsWith(p));
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

function Section({ title, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="px-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function AdminApprovalQueue() {
  const [passed, setPassed] = useState([]);
  const [needsCall, setNeedsCall] = useState([]);
  const [noSite, setNoSite] = useState([]);
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
      const pendingItems = pending?.items || [];
      const rejectedItems = rejected?.items || [];

      // 'verified — …' passed every gate; anything else is the single check
      // that a human has to settle.
      setPassed(pendingItems.filter((c) => String(c.private_reason || '').startsWith('verified')));
      setNeedsCall(pendingItems.filter((c) => !String(c.private_reason || '').startsWith('verified')));

      // Anything never enriched from both sources can be re-checked with the
      // Google profile facts attached, and may then become approvable.
      const stale = [...pendingItems, ...rejectedItems].filter(
        (c) => !String(c.place_id || '').trim() && !isDecided(c)
      );
      const addressFixes = rejectedItems.filter((c) => isRetryable(c) && c.official_website);
      setRetryable(new Set([...stale, ...addressFixes].map((c) => c.id)).size);
      setNoSite(
        rejectedItems
          .filter((c) => String(c.private_reason || '').startsWith('no supported official venue website'))
          .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999))
      );
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
      const res = await findLocalDiscoveryCandidates({ limit: 6 });
      const fresh = (res.awaiting_approval || 0) + (res.needs_your_review || 0);
      setNote(
        `${res.places_found} golf venues within 30 mi · ${fresh} new for you · ${res.duplicates} already listed · ${res.rejected} not a fit`
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
        `${res.checked} re-checked · ${res.now_awaiting_approval} ready for you · ${res.still_rejected} not a fit (all reasons recorded)`
      );
      await load();
    } catch (e) {
      setError(errText(e));
    }
    setBusy('');
  };

  const decide = async (candidate, action, opts = {}) => {
    setBusy(candidate.id);
    setError('');
    setNote('');
    try {
      await reviewDiscoveryCandidate({
        candidate_id: candidate.id,
        action,
        ...(opts.adminOverride ? { admin_override: true } : {}),
      });
      setNote(action === 'approve' ? `${candidate.name} published` : `${candidate.name} rejected`);
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

  const total = passed.length + needsCall.length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              {total} venue{total === 1 ? '' : 's'} waiting on you
            </div>
            <div className="text-[11px] text-muted-foreground">
              Every card carries the website, address, phone and Google rating. Nothing is published until
              you approve it.
            </div>
          </div>
        </div>

        {retryable > 0 && (
          <div className="mt-3 rounded-lg bg-secondary/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">
              {retryable} venue{retryable === 1 ? '' : 's'} were checked before Google details were
              attached. Re-checking fills in the website, phone and rating, and brings back anything that
              was turned down on incomplete data.
            </div>
            <Button variant="secondary" className="h-9 w-full mt-2" disabled={!!busy} onClick={runReverify}>
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
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">{note}</div>
      )}

      {total === 0 && noSite.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldQuestion className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium text-foreground">Nothing to approve</p>
          <p className="text-xs mt-1">
            {retryable > 0 ? 'Re-check the address-only rejections above.' : 'Every verified venue has been decided.'}
          </p>
        </div>
      ) : (
        <>
          {needsCall.length > 0 && (
            <Section
              title={`Needs your call · ${needsCall.length}`}
              hint="Real venues anchored to a Google listing. One detail could not be confirmed automatically."
            >
              {needsCall.map((c) => (
                <ApprovalCandidateCard key={c.id} candidate={c} busy={busy} onDecide={decide} />
              ))}
            </Section>
          )}

          {passed.length > 0 && (
            <Section title={`Ready to publish · ${passed.length}`} hint="Every automated check passed.">
              {passed.map((c) => (
                <ApprovalCandidateCard key={c.id} candidate={c} busy={busy} onDecide={decide} />
              ))}
            </Section>
          )}

          {noSite.length > 0 && (
            <Section
              title={`No website found · ${noSite.length}`}
              hint="Google has no website for these, so they can only be confirmed from the business profile."
            >
              {noSite.map((c) => (
                <ApprovalCandidateCard key={c.id} candidate={c} busy={busy} onDecide={decide} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}