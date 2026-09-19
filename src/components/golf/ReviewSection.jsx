import { useState } from 'react';
import { Star, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useGate } from '@/components/golf/GateProvider';
import { useToast } from '@/components/ui/use-toast';
import ReviewForm from './ReviewForm';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Reviews are served through getListingDetails (server-side gated).
// Players never directly query the Review entity for other
// players' reviews. The user's own review (any status) is passed
// as myReview. Approved reviews from all players are passed as
// reviews. Delete uses RLS (created_by_id only).
export default function ReviewSection({ listingId, listingName, reviews = [], myReview = null, onReload }) {
  const { user } = useAuth();
  const { gate, isAuthed } = useGate();
  const { toast } = useToast();
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleDelete = async (id) => {
    try {
      await base44.entities.Review.delete(id);
      toast({ title: 'Review deleted' });
      onReload?.();
    } catch {
      toast({ title: 'Could not delete' });
    }
  };

  const onDone = () => {
    setWriting(false);
    setEditing(null);
    onReload?.();
  };

  const approved = reviews || [];
  const avg = approved.length
    ? (approved.reduce((s, r) => s + r.rating, 0) / approved.length).toFixed(1)
    : null;

  // If the user's own review is approved, it's already in the
  // approved list — don't show it separately. If pending/rejected,
  // show it with a status badge.
  const showMyReviewSeparately = myReview && myReview.status !== 'approved';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Reviews</h2>
        {avg && (
          <span className="flex items-center gap-1 text-sm font-semibold">
            <Star className="h-4 w-4 fill-rating text-rating" /> {avg}
          </span>
        )}
      </div>

      {writing || editing ? (
        <div className="glass-card rounded-2xl border border-border p-4">
          <ReviewForm listingId={listingId} listingName={listingName} review={editing || myReview} onDone={onDone} />
          <button
            onClick={() => { setWriting(false); setEditing(null); }}
            className="text-sm text-muted-foreground mt-3"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {isAuthed ? (
            !myReview && (
              <button
                onClick={() => setWriting(true)}
                className="w-full h-12 rounded-2xl glass-card border border-border font-semibold flex items-center justify-center gap-2"
              >
                <MessageSquare className="h-4 w-4 text-primary" /> Write a review
              </button>
            )
          ) : (
            <button
              onClick={() => gate()}
              className="w-full h-12 rounded-2xl glass-card border border-border font-semibold flex items-center justify-center gap-2"
            >
              <MessageSquare className="h-4 w-4 text-primary" /> Sign in to review
            </button>
          )}

          {isAuthed && myReview && (
            <button
              onClick={() => setEditing(myReview)}
              className="w-full text-left rounded-2xl glass-card border border-border p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn('h-3.5 w-3.5', n <= myReview.rating ? 'fill-rating text-rating' : 'text-muted-foreground/40')}
                    />
                  ))}
                </div>
                {myReview.status !== 'approved' && (
                  <span
                    className={cn(
                      'text-[10px] font-semibold rounded-full px-2 py-0.5',
                      myReview.status === 'pending'
                        ? 'bg-secondary text-muted-foreground'
                        : 'bg-destructive/15 text-destructive'
                    )}
                  >
                    {myReview.status === 'pending'
                      ? 'Under review'
                      : myReview.status === 'hidden'
                      ? 'Hidden by admin'
                      : 'Not published'}
                  </span>
                )}
              </div>
              {myReview.title && <p className="font-semibold text-sm">{myReview.title}</p>}
              <p className="text-sm mt-1 leading-relaxed line-clamp-2">{myReview.body}</p>
              <div className="flex items-center gap-2 mt-2">
                <Pencil className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tap to edit your review</span>
              </div>
            </button>
          )}

          {approved.length === 0 && !showMyReviewSeparately ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No reviews yet. Be the first to share your experience.
            </p>
          ) : (
            <div className="space-y-3">
              {approved.map((r) => (
                <ReviewCard key={r.id} review={r} canEdit={false} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({ review, canEdit, onEdit, onDelete }) {
  return (
    <div className="glass-card rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn('h-3.5 w-3.5', n <= review.rating ? 'fill-rating text-rating' : 'text-muted-foreground/40')}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{review.author_name || 'Golfer'}</span>
          {review.created_date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(review.created_date), 'MMM d')}
            </span>
          )}
          {review.visit_date && (
            <span className="text-xs text-muted-foreground">
              · Visited {format(parseISO(review.visit_date), 'MMM d')}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={onEdit} className="text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {review.title && <p className="font-semibold text-sm mt-2">{review.title}</p>}
      <p className="text-sm mt-1 leading-relaxed">{review.body}</p>
      {review.photo_url && (
        <img src={review.photo_url} alt="Review" className="h-32 w-32 rounded-xl object-cover mt-3" />
      )}
    </div>
  );
}