import { useEffect, useState, useCallback } from 'react';
import { Star, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useGate } from '@/components/golf/GateProvider';
import { useToast } from '@/components/ui/use-toast';
import ReviewForm from './ReviewForm';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ReviewSection({ listingId, listingName }) {
  const { user } = useAuth();
  const { gate, isAuthed } = useGate();
  const { toast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.Review.filter({ listing_id: listingId }, '-created_date', 100);
      setReviews(list);
    } catch {
      setReviews([]);
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  const myReview = reviews.find((r) => r.created_by_id === user?.id);

  const handleDelete = async (id) => {
    try {
      await base44.entities.Review.delete(id);
      toast({ title: 'Review deleted' });
      load();
    } catch {
      toast({ title: 'Could not delete' });
    }
  };

  const onDone = () => {
    setWriting(false);
    setEditing(null);
    load();
  };

  const approved = reviews.filter((r) => r.status === 'approved');
  const avg = approved.length
    ? (approved.reduce((s, r) => s + r.rating, 0) / approved.length).toFixed(1)
    : null;

  if (loading) return <div className="h-20 shimmer rounded-2xl" />;

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
          <ReviewForm listingId={listingId} listingName={listingName} review={editing} onDone={onDone} />
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

          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No reviews yet. Be the first to share your experience.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => {
                const mine = r.created_by_id === user?.id;
                return (
                  <div key={r.id} className="glass-card rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={cn('h-3.5 w-3.5', n <= r.rating ? 'fill-rating text-rating' : 'text-muted-foreground/40')}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{mine ? 'You' : 'Golfer'}</span>
                        {r.created_date && (
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(r.created_date), 'MMM d')}
                          </span>
                        )}
                        {r.status !== 'approved' && (
                          <span
                            className={cn(
                              'text-[10px] font-semibold rounded-full px-2 py-0.5',
                              r.status === 'pending'
                                ? 'bg-secondary text-muted-foreground'
                                : 'bg-destructive/15 text-destructive'
                            )}
                          >
                            {r.status === 'pending' ? 'In review' : 'Not approved'}
                          </span>
                        )}
                      </div>
                      {mine && (
                        <div className="flex gap-2">
                          <button onClick={() => setEditing(r)} className="text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm mt-2 leading-relaxed">{r.body}</p>
                    {r.photo_url && (
                      <img src={r.photo_url} alt="Review" className="h-32 w-32 rounded-xl object-cover mt-3" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}