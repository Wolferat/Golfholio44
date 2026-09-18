import { useState } from 'react';
import { Star, ImagePlus, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function ReviewForm({ listingId, listingName, review, onDone }) {
  const { toast } = useToast();
  const [rating, setRating] = useState(review?.rating || 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(review?.body || '');
  const [photoUrl, setPhotoUrl] = useState(review?.photo_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setPhotoUrl(file_url);
    } catch {
      toast({ title: 'Photo upload failed' });
    }
    setUploading(false);
  };

  const submit = async () => {
    if (rating < 1 || rating > 5) { toast({ title: 'Pick a star rating' }); return; }
    if (!body.trim()) { toast({ title: 'Write a few words' }); return; }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('submitReview', {
        listing_id: listingId,
        listing_name: listingName,
        rating,
        body: body.trim(),
        photo_url: photoUrl,
        ...(review?.id ? { review_id: review.id } : {}),
      });
      toast({
        title: review ? 'Review updated' : 'Review submitted',
        description: 'Thanks for sharing your experience.',
      });
      onDone(res.data.review);
    } catch {
      toast({ title: 'Could not submit review' });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            whileTap={{ scale: 0.85 }}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            <Star className={cn('h-8 w-8 transition', (hover || rating) >= n ? 'fill-rating text-rating' : 'text-muted-foreground')} />
          </motion.button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share your experience at this venue…"
        className="min-h-[100px] resize-none"
        maxLength={2000}
      />
      <div>
        {photoUrl ? (
          <div className="relative inline-block">
            <img src={photoUrl} alt="Review" className="h-24 w-24 rounded-xl object-cover" />
            <button
              onClick={() => setPhotoUrl('')}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground grid place-items-center"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 text-sm font-medium text-primary cursor-pointer">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Attach a photo'}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Your review is checked by automated moderation before it's shown to others. Photos are separate from official venue images.
      </p>
      <Button className="w-full h-12" onClick={submit} disabled={saving || uploading}>
        {saving ? 'Saving…' : review ? 'Update review' : 'Post review'}
      </Button>
    </div>
  );
}