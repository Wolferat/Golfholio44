import { useEffect, useState, useCallback } from 'react';
import { Check, X, ShieldCheck, ImageOff, Flag } from 'lucide-react';
import { getPendingPhotos, reviewPhoto, getFlaggedListings } from '@/lib/golfData';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('photos');
  const [photos, setPhotos] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, f] = await Promise.all([getPendingPhotos(), getFlaggedListings()]);
    setPhotos(p);
    setFlagged(f);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (id, action) => { await reviewPhoto(id, action); await load(); };

  if (user?.role !== 'admin') {
    return (
      <div className="safe-top px-4 pt-24 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium text-foreground">Admin access required</p>
        <p className="text-xs mt-1">This workspace is for authorized administrators.</p>
      </div>
    );
  }

  return (
    <div className="safe-top px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-heading">Admin</h1>
        <p className="text-sm text-muted-foreground">Listing quality & moderation</p>
      </header>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <TabButton active={tab === 'photos'} onClick={() => setTab('photos')} label="Photos" count={photos.length} />
        <TabButton active={tab === 'listings'} onClick={() => setTab('listings')} label="Listings" count={flagged.length} />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />)}</div>
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

function TabButton({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-11 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
      )}
    >
      {label}
      {count > 0 && (
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