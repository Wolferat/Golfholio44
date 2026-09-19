import { useState } from 'react';
import { Check, X, EyeOff, RotateCcw, Star, ImageOff, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ============================================================
// Admin Reviews — private admin review queue.
//
// Shows every submitted review with:
//   - player name, listing, rating, title/body, visit date
//   - moderation result/reason
//   - review-photo safety state
//   - creation/edit time, current status
//
// Admin actions: approve, reject, hide, restore.
// All actions are server-authorized (moderateReview backend function).
// ============================================================

const STATUS_LABEL = {
  approved: 'Published',
  pending: 'Under review',
  rejected: 'Not published',
  hidden: 'Hidden',
};

const STATUS_COLOR = {
  approved: 'text-primary',
  pending: 'text-muted-foreground',
  rejected: 'text-destructive',
  hidden: 'text-destructive',
};

export default function AdminReviews({ reviews, onAction }) {
  const [actionReview, setActionReview] = useState(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  const handleAction = async (id, action) => {
    setPending(true);
    try {
      await onAction(id, action, reason.trim());
      setActionReview(null);
      setReason('');
    } catch {}
    setPending(false);
  };

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium text-foreground">All caught up</p>
        <p className="text-xs mt-1">No reviews awaiting moderation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate">{r.author_name}</span>
                <span className={cn('text-[11px] font-semibold', STATUS_COLOR[r.status])}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {r.listing_name}
              </div>
            </div>
            <div className="flex shrink-0">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn('h-3.5 w-3.5', n <= r.rating ? 'fill-rating text-rating' : 'text-muted-foreground/40')}
                />
              ))}
            </div>
          </div>

          {r.title && <p className="font-semibold text-sm mb-1">{r.title}</p>}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{r.body}</p>

          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
            {r.visit_date && <span>Visited {r.visit_date}</span>}
            <span>{String(r.created_date || '').slice(0, 10)}</span>
            {r.has_photo && (
              <span className="flex items-center gap-1">
                {r.photo_safety_state === 'rejected' ? (
                  <><ImageOff className="h-3 w-3 text-destructive" /> Photo rejected</>
                ) : (
                  <><Camera className="h-3 w-3" /> Photo attached</>
                )}
              </span>
            )}
          </div>

          {r.moderation_note && (
            <div className="mt-2 text-[11px] text-muted-foreground bg-secondary/50 rounded-lg px-2 py-1.5">
              <span className="font-semibold">Auto-moderation:</span> {r.moderation_note}
            </div>
          )}

          {actionReview === r.id ? (
            <div className="mt-3 space-y-2">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="min-h-[60px] resize-none text-sm"
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button className="flex-1 h-9" disabled={pending} onClick={() => handleAction(r.id, 'approve')}>
                  <Check className="h-4 w-4" /> Approve
                </Button>
                <Button variant="secondary" className="flex-1 h-9" disabled={pending} onClick={() => handleAction(r.id, 'reject')}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                {r.status !== 'hidden' && (
                  <Button variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => handleAction(r.id, 'hide')}>
                    <EyeOff className="h-4 w-4" />
                  </Button>
                )}
                {r.status === 'hidden' && (
                  <Button variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => handleAction(r.id, 'restore')}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => { setActionReview(null); setReason(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mt-3">
              <Button className="flex-1 h-9" disabled={pending} onClick={() => setActionReview(r.id)}>
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button variant="secondary" className="flex-1 h-9" disabled={pending} onClick={() => setActionReview(r.id)}>
                <X className="h-4 w-4" /> Reject
              </Button>
              {r.status !== 'hidden' ? (
                <Button variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => handleAction(r.id, 'hide')}>
                  <EyeOff className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="ghost" className="h-9 px-3" disabled={pending} onClick={() => handleAction(r.id, 'restore')}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}