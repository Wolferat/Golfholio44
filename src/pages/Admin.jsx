import { useEffect, useState, useCallback } from 'react';
import { Check, X, ShieldCheck, ImageOff, Flag, ShieldAlert, ClipboardList, FileSearch, MapPin, AlertTriangle, Copy, Link2Off, ImageUp, CalendarX } from 'lucide-react';
import { getPendingPhotos, reviewPhoto, getFlaggedListings, getPendingListings, reviewListingAction, getAuditReport } from '@/lib/golfData';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [photos, setPhotos] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [pending, setPending] = useState([]);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'pending') {
        const p = await getPendingListings('pending');
        setPending(p);
      } else if (tab === 'audit') {
        const a = await getAuditReport();
        setAudit(a);
      } else if (tab === 'photos') {
        const p = await getPendingPhotos();
        setPhotos(p);
      } else if (tab === 'listings') {
        const f = await getFlaggedListings();
        setFlagged(f);
      }
    } catch {}
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id, action) => { await reviewPhoto(id, action); await load(); };

  const handleListingReview = async (id, action) => {
    setReviewing(true);
    try { await reviewListingAction(id, action); await load(); } catch {}
    setReviewing(false);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="safe-top px-4 pt-24 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium text-foreground">Admin access required</p>
        <p className="text-xs mt-1">This workspace is for authorized administrators.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'audit', label: 'Audit', count: null },
    { key: 'photos', label: 'Photos', count: photos.length },
    { key: 'listings', label: 'Flagged', count: flagged.length },
  ];

  return (
    <div className="safe-top px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-heading">Admin</h1>
        <p className="text-sm text-muted-foreground">Listing trust & moderation</p>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
        {tabs.map((t) => (
          <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} label={t.label} count={t.count} />
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />)}</div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No pending listings" subtitle="All caught up." />
        ) : (
          <div className="space-y-3">
            {pending.map((l) => (
              <div key={l.id} className="rounded-xl bg-card border border-border p-3">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {l.type} · {l.city}, {l.state}
                    </div>
                    {l.source_url && (
                      <div className="text-xs text-primary mt-1 truncate">{l.source_url}</div>
                    )}
                    {l.verification_notes && (
                      <div className="text-xs text-muted-foreground mt-1">{l.verification_notes}</div>
                    )}
                  </div>
                  <span className="text-[11px] rounded-full bg-secondary px-2 py-0.5 shrink-0">
                    Tier {l.verification_tier || '?'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 h-9" disabled={reviewing} onClick={() => handleListingReview(l.id, 'approve')}>
                    <Check className="h-4 w-4 mr-1" />Approve
                  </Button>
                  <Button variant="secondary" className="flex-1 h-9" disabled={reviewing} onClick={() => handleListingReview(l.id, 'reject')}>
                    <X className="h-4 w-4 mr-1" />Reject
                  </Button>
                  <Button variant="ghost" className="h-9 px-3" disabled={reviewing} onClick={() => handleListingReview(l.id, 'archive')}>
                    <ClipboardList className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'audit' ? (
        <AuditReport audit={audit} />
      ) : tab === 'photos' ? (
        photos.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="All caught up" subtitle="No photos awaiting review." />
        ) : (
          <div className="space-y-3">
            {photos.map((p) => (
              <div key={p.id} className="rounded-xl bg-card border border-border p-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-16 w-16 rounded-lg bunker-gradient shrink-0 grid place-items-center">
                    <ImageOff className="h-6 w-6 text-accent-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.listing}</div>
                    <div className="text-xs text-muted-foreground">by @{p.submittedBy} · {p.submittedAt}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 h-10" onClick={() => handleReview(p.id, 'approved')}>
                    <Check className="h-4 w-4 mr-1" />Approve
                  </Button>
                  <Button variant="secondary" className="flex-1 h-10" onClick={() => handleReview(p.id, 'rejected')}>
                    <X className="h-4 w-4 mr-1" />Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        flagged.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No flagged listings" subtitle="Everything looks clean." />
        ) : (
          <div className="space-y-2">
            {flagged.map((f) => (
              <div key={f.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
                <Flag className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function AuditReport({ audit }) {
  if (!audit) return <EmptyState icon={FileSearch} title="No audit data" subtitle="Run the audit to see results." />;
  const { summary, audit: details } = audit;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total listings" value={summary.total} />
        <StatCard label="Non-golf" value={summary.nonGolf} icon={AlertTriangle} danger />
        <StatCard label="Out of radius" value={summary.outOfRadius} icon={MapPin} />
        <StatCard label="Bad categories" value={summary.categoryMismatches} icon={AlertTriangle} />
        <StatCard label="Duplicates" value={summary.duplicates} icon={Copy} />
        <StatCard label="No source" value={summary.noCredibleSource} icon={Link2Off} />
        <StatCard label="Unverified photos" value={summary.unverifiedPhotos} icon={ImageUp} />
        <StatCard label="Expired events" value={summary.expiredEvents} icon={CalendarX} />
      </div>
      {summary.legacyTypes > 0 && (
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="text-sm font-semibold mb-1">Legacy type migration needed</div>
          <div className="text-xs text-muted-foreground">{summary.legacyTypes} records use the old "lesson" type and should be migrated to "training".</div>
        </div>
      )}
      {details.nonGolf.length > 0 && (
        <AuditSection title="Probable non-golf listings" items={details.nonGolf} render={(r) => `${r.name} (${r.type}) — ${r.reason}`} />
      )}
      {details.outOfRadius.length > 0 && (
        <AuditSection title="Out of 15-mile radius" items={details.outOfRadius} render={(r) => `${r.name} — ${r.distance} mi`} />
      )}
      {details.expiredEvents.length > 0 && (
        <AuditSection title="Past events still public" items={details.expiredEvents} render={(r) => `${r.name} — ended ${String(r.endsAt).slice(0, 10)}`} />
      )}
      {details.noCredibleSource.length > 0 && (
        <AuditSection title="No credible source" items={details.noCredibleSource} render={(r) => `${r.name} (${r.type}, ${r.status})`} />
      )}
      {details.unverifiedPhotos.length > 0 && (
        <AuditSection title="Unverified photos" items={details.unverifiedPhotos} render={(r) => `${r.name} — ${r.photoCount} photo(s)`} />
      )}
    </div>
  );
}

function AuditSection({ title, items, render }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title} ({items.length})</div>
      <div className="space-y-1.5">
        {items.slice(0, 20).map((r) => (
          <div key={r.id} className="text-xs rounded-lg bg-card border border-border px-3 py-2 text-muted-foreground">
            {render(r)}
          </div>
        ))}
        {items.length > 20 && <div className="text-xs text-muted-foreground px-3">+ {items.length - 20} more…</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, danger }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn('text-2xl font-bold', danger && value > 0 && 'text-destructive')}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-11 px-4 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 shrink-0 transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span className={cn('text-[11px] rounded-full px-1.5 py-0.5', active ? 'bg-primary-foreground/20' : 'bg-secondary')}>
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-xs mt-1">{subtitle}</p>
    </div>
  );
}