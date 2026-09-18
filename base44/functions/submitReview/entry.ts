import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Automated review moderation. Authenticated players submit a review
// (rating + text + optional photo). An LLM safety check runs before the
// record is stored: safe -> approved (visible to all), unsafe -> rejected,
// uncertain/error -> pending (fail-closed: hidden from other players until
// an admin reviews). Edits re-run moderation on the new content.
const MOD_SCHEMA = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['safe', 'reason'],
};

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
    const photoUrl = (body.photo_url || '').trim();
    const listingName = (body.listing_name || '').trim();

    if (!listingId) return Response.json({ error: 'Listing required' }, { status: 400 });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return Response.json({ error: 'Rating must be 1–5' }, { status: 400 });
    if (!text || text.length > 2000)
      return Response.json({ error: 'Review text required (max 2000 chars)' }, { status: 400 });

    let status = 'pending';
    let modNote = '';
    try {
      const fileUrls = photoUrl ? [photoUrl] : null;
      const prompt =
        'You are a content safety moderator for a golf community app. Decide whether the following player review' +
        (photoUrl ? ' and attached photo' : '') +
        ' is safe to publish to all players. Reject (safe=false) if it contains unsafe, adult, hateful, violent, ' +
        'deceptive, spam, promotional abuse, harassment, or content unrelated to a real golf venue experience. ' +
        'Otherwise approve (safe=true). Provide a short reason.\n\nReview text: """' + text + '"""';
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: MOD_SCHEMA,
        ...(fileUrls ? { file_urls: fileUrls } : {}),
      });
      const mod = result?.data || result;
      if (mod && typeof mod.safe === 'boolean') {
        status = mod.safe ? 'approved' : 'rejected';
        modNote = (mod.reason || '').slice(0, 300);
      } else {
        status = 'pending';
      }
    } catch {
      // Fail closed: uncertain moderation keeps the review hidden from others.
      status = 'pending';
    }

    const payload = {
      listing_id: listingId,
      listing_name: listingName || null,
      rating,
      body: text,
      photo_url: photoUrl || null,
      status,
      moderation_note: modNote || null,
    };

    if (reviewId) {
      // Edit: RLS update rule restricts to owner.
      const updated = await base44.entities.Review.update(reviewId, payload);
      return Response.json({ review: updated });
    }

    const created = await base44.entities.Review.create(payload);
    return Response.json({ review: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}