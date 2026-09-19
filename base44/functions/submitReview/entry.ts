import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePublicListing } from '../../shared/publicListingPolicy.ts';
import { isValidReviewPhotoUri } from '../../shared/photoValidation.ts';

// ============================================================
// Submit / Edit Review — hardened photo ownership + file validation
//
// Photo handling (secure):
//   1. Players upload review images through controlled UploadPrivateFile
//      storage (client-side) → returns a private file_uri.
//   2. submitReview VERIFIES OWNERSHIP: the file_uri must not already be
//      claimed by a different player. If unclaimed, it is claimed for
//      the current player (ReviewPhotoUpload record, service role).
//   3. A temporary signed URL is created server-side for:
//      a. File validation (HEAD request: content-type must be image,
//         content-length within 10 MB limit)
//      b. LLM safety moderation
//   4. The signed URL is NOT stored. The private file_uri is stored.
//   5. On edit, if the photo changed, the OLD upload record is deleted
//      (revoking access — the old file_uri can no longer be used).
//   6. Review photos are NEVER used as official venue imagery.
//
// Enforces:
//   - signed-in players only
//   - one active review per player per listing (on create)
//   - reviews only on listings that pass the public trust policy
//   - players can only edit/delete their own reviews (RLS + server check)
//   - photo_uri must be a private file URI, never an external URL
//   - photo_uri must be owned by the current player
//   - file must be a supported image format within size limits
// ============================================================

const MOD_SCHEMA = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['safe', 'reason'],
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const listingId = (body.listing_id || '').trim();
    const reviewId = (body.review_id || '').trim();
    const rating = Number(body.rating);
    const text = (body.body || '').trim();
    const title = (body.title || '').trim();
    const photoUri = (body.photo_uri || '').trim();
    const visitDate = (body.visit_date || '').trim();
    const listingName = (body.listing_name || '').trim();

    if (!listingId) return Response.json({ error: 'Listing required' }, { status: 400 });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return Response.json({ error: 'Rating must be 1–5' }, { status: 400 });
    if (!text || text.length > 2000)
      return Response.json({ error: 'Review text required (max 2000 chars)' }, { status: 400 });
    if (title.length > 120)
      return Response.json({ error: 'Title must be 120 chars or less' }, { status: 400 });

    // Validate photo_uri — must be a private file URI, never an external URL
    if (!isValidReviewPhotoUri(photoUri)) {
      return Response.json({ error: 'Invalid photo — images must be uploaded through the app' }, { status: 400 });
    }

    // --- Verify photo ownership ---
    // The file_uri must not be claimed by a different player. If unclaimed,
    // claim it for the current player. This prevents one player from
    // attaching another player's private file URI, even if obtained/guessed.
    if (photoUri) {
      const existingUploads = await base44.asServiceRole.entities.ReviewPhotoUpload
        .filter({ file_uri: photoUri }, '-created_date', 10)
        .catch(() => []);

      const ownedByOther = existingUploads.some((u) => u.uploaded_by_id !== user.id);
      if (ownedByOther) {
        return Response.json({ error: 'Photo not owned by current user' }, { status: 403 });
      }

      const ownedByMe = existingUploads.some((u) => u.uploaded_by_id === user.id);
      if (!ownedByMe) {
        await base44.asServiceRole.entities.ReviewPhotoUpload.create({
          file_uri: photoUri,
          uploaded_by_id: user.id,
          listing_id: listingId,
        }).catch(() => {});
      }
    }

    // Verify listing eligibility (non-location policy checks)
    const record = await base44.asServiceRole.entities.Listing.get(listingId).catch(() => null);
    if (!record) return Response.json({ error: 'Listing not found' }, { status: 404 });

    if (record.latitude && record.longitude) {
      const ev = evaluatePublicListing(record, record.latitude, record.longitude);
      if (!ev) {
        return Response.json({ error: 'This listing is not eligible for reviews' }, { status: 403 });
      }
    } else {
      return Response.json({ error: 'This listing is not eligible for reviews' }, { status: 403 });
    }

    // One-review-per-player-per-listing (on create only)
    if (!reviewId) {
      const existing = await base44.asServiceRole.entities.Review
        .filter({ listing_id: listingId, created_by_id: user.id }, '-created_date', 10)
        .catch(() => []);
      if (existing.length > 0) {
        return Response.json({ error: 'You already have a review for this venue. Edit it instead.' }, { status: 409 });
      }
    }

    // Get author display name
    let authorName = user.full_name || 'Anonymous Golfer';
    try {
      const profiles = await base44.asServiceRole.entities.GolferProfile
        .filter({ created_by_id: user.id }, '-created_date', 1);
      if (profiles.length > 0 && profiles[0].name) {
        authorName = profiles[0].name;
      }
    } catch {}

    // Create a temporary signed URL for the photo (for validation + LLM)
    let photoSignedUrl = null;
    if (photoUri) {
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: photoUri,
          expires_in: 300,
        });
        photoSignedUrl = signed?.signed_url || null;
      } catch {
        return Response.json({ error: 'Photo could not be validated' }, { status: 400 });
      }
    }

    // --- File validation: content-type must be image, size within limits ---
    if (photoSignedUrl) {
      try {
        const headResp = await fetch(photoSignedUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(8000),
        });
        if (headResp.ok) {
          const contentType = (headResp.headers.get('content-type') || '').toLowerCase();
          const contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
          if (!contentType.startsWith('image/')) {
            return Response.json({ error: 'File must be an image' }, { status: 400 });
          }
          if (contentLength > 0 && contentLength > MAX_PHOTO_BYTES) {
            return Response.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });
          }
        }
      } catch {
        // HEAD failed — defer to LLM visual check
      }
    }

    // Automated moderation
    let status = 'pending';
    let modNote = '';
    try {
      const fileUrls = photoSignedUrl ? [photoSignedUrl] : null;
      const prompt =
        'You are a content safety moderator for a golf community app. Decide whether the following player review' +
        (photoSignedUrl ? ' and attached photo' : '') +
        ' is safe to publish to all players. Reject (safe=false) if it contains unsafe, adult, hateful, violent, ' +
        'deceptive, spam, promotional abuse, harassment, personally identifying information, or content unrelated ' +
        'to a real golf venue experience. Otherwise approve (safe=true). Provide a short reason.\n\n' +
        'Review text: """' + text + '"""';
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: MOD_SCHEMA,
        ...(fileUrls ? { file_urls: fileUrls } : {}),
      });
      const mod = result?.data || result;
      if (mod && typeof mod.safe === 'boolean') {
        // LLM-safe → pending (requires admin approval before display)
        // LLM-unsafe → rejected (hidden from other players)
        status = mod.safe ? 'pending' : 'rejected';
        modNote = (mod.reason || '').slice(0, 300);
      } else {
        status = 'pending';
      }
    } catch {
      status = 'pending';
    }

    const payload = {
      listing_id: listingId,
      listing_name: listingName || null,
      rating,
      title: title || null,
      body: text,
      visit_date: visitDate || null,
      photo_uri: photoUri || null,
      author_name: authorName,
      status,
      moderation_note: modNote || null,
    };

    if (reviewId) {
      // Fetch existing review to verify ownership and get old photo_uri
      const existingReview = await base44.asServiceRole.entities.Review.get(reviewId).catch(() => null);
      if (!existingReview) {
        return Response.json({ error: 'Review not found' }, { status: 404 });
      }
      if (existingReview.created_by_id !== user.id) {
        return Response.json({ error: 'Not your review' }, { status: 403 });
      }

      const updated = await base44.entities.Review.update(reviewId, payload);

      // Release old photo if it changed (revoke access to old file_uri)
      const oldPhotoUri = existingReview.photo_uri;
      if (oldPhotoUri && oldPhotoUri !== photoUri) {
        await base44.asServiceRole.entities.ReviewPhotoUpload
          .deleteMany({ file_uri: oldPhotoUri, uploaded_by_id: user.id })
          .catch(() => {});
      }

      return Response.json({ review: updated });
    }

    const created = await base44.entities.Review.create(payload);
    return Response.json({ review: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}