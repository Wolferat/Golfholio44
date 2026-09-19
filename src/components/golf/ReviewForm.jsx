import { useState, useRef } from 'react';
import { Star, ImagePlus, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// ============================================================
// Review Form — mobile-first single-column layout.
//
// Field order:
//   1. rating
//   2. optional title
//   3. written review
//   4. optional visit date
//   5. optional photo
//   6. moderation/privacy explanation
//   7. submit/cancel actions
//
// All fields stack vertically with consistent spacing. No
// multi-column controls that could compress on narrow phones.
// Safe-area bottom padding prevents the bottom nav from covering
// the submit button.
// ============================================================

export default function ReviewForm({ listingId, listingName, review, onDone }) {
  const { toast } = useToast();
  const [rating, setRating] = useState(review?.rating || 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(review?.body || '');
  const [title, setTitle] = useState(review?.title || '');
  const [visitDate, setVisitDate] = useState(review?.visit_date || '');
  const [photoUri, setPhotoUri] = useState(review?.photo_uri || '');
  const [photoPreview, setPhotoPreview] = useState(review?.photo_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const blobRef = useRef(null);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Photo too large (max 10 MB)' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Only image files are allowed' });
      return;
    }
    setUploading(true);
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = URL.createObjectURL(file);
    setPhotoPreview(blobRef.current);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setPhotoUri(file_uri);
    } catch {
      toast({ title: 'Photo upload failed' });
      setPhotoPreview('');
      setPhotoUri('');
    }
    setUploading(false);
  };

  const removePhoto = () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setPhotoUri('');
    setPhotoPreview('');
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
        title: title.trim(),
        body: body.trim(),
        visit_date: visitDate,
        photo_uri: photoUri || undefined,
        ...(review?.id ? { review_id: review.id } : {}),
      });
      toast({
        title: review ? 'Review updated' : 'Review submitted',
        description: 'Thanks for sharing your experience.',
      });
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      onDone(res.data.review);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message;
      toast({ title: msg || 'Could not submit review' });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* 1. Rating */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Rating</p>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <motion.button
              key={n}
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star className={cn('h-8 w-8 transition', (hover || rating) >= n ? 'fill-rating text-rating' : 'text-muted-foreground')} />
            </motion.button>
          ))}
        </div>
      </div>

      {/* 2. Optional title */}
      <div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          maxLength={120}
          className="h-12"
        />
      </div>

      {/* 3. Written review */}
      <div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your experience at this venue…"
          className="min-h-[120px] resize-none"
          maxLength={2000}
        />
      </div>

      {/* 4. Optional visit date */}
      <div>
        <Input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="h-12"
        />
        <p className="text-[11px] text-muted-foreground mt-1">Visit date (optional)</p>
      </div>

      {/* 5. Optional photo */}
      <div>
        {photoPreview ? (
          <div className="relative inline-block">
            <img src={photoPreview} alt="Review" className="h-24 w-24 rounded-xl object-cover" />
            <button
              type="button"
              onClick={removePhoto}
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

      {/* 6. Moderation/privacy explanation */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Your review is checked by automated moderation before it's shown to others. Photos are stored securely and are separate from official venue images.
      </p>

      {/* 7. Submit/cancel actions */}
      <div className="flex flex-col gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button className="w-full h-12" onClick={submit} disabled={saving || uploading}>
          {saving ? 'Saving…' : review ? 'Update review' : 'Post review'}
        </Button>
      </div>
    </div>
  );
}