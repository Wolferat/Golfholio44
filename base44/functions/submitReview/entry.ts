import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePublicListing } from '../../shared/publicListingPolicy.ts';

// ============================================================
// Submit / Edit Review
//
// Authenticated players submit a review (rating, optional title,
// written body, optional visit date, optional photo). An LLM
// safety check runs before the record is stored:
//   safe     -> approved (visible to all)
//   unsafe   -> rejected (hidden from other players)
//   uncertain/ error -> pending (fail-closed: hidden until admin)
//
// Edits re-run moderation on the new content.
//
// Enforces:
//   - signed-in players only
//   - one active review per player per listing (on create)
//   - reviews only on listings that pass the public trust policy
//   - players can only edit/delete their own reviews (RLS)
// ============================================================

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
    const title = (body.title || '').trim();
    const photoUrl = (body.photo_url || '').trim();
    const visitDate = (body.visit_date || '').trim();
    const listingName = (body.listing_name || '').trim();

    if (!listingId) return Response.json({ error: 'Listing required' }, { status: 400 });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return Response.json({ error: 'Rating must be 1–5' }, { status: 400 });
    if (!text || text.length > 2000)
      return Response.json({ error: 'Review text required (max 2000 chars)' }, { status: 400 });
    if (title.length > 120)
      return Response.json({ error: 'Title must be 120 chars or less' }, { status: 400 });

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
      const existing = await base44.entities.Review
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

    // Automated moderation
    let status = 'pending';
    let modNote = '';
    try {
      const fileUrls = photoUrl ? [photoUrl] : null;
      const prompt =
        'You are a content safety moderator for a golf community app. Decide whether the following player review' +
        (photoUrl ? ' and attached photo' : '') +
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
        status = mod.safe ? 'approved' : 'rejected';
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
      photo_url: photoUrl || null,
      author_name: authorName,
      status,
      moderation_note: modNote || null,
    };

    if (reviewId) {
      const updated = await base44.entities.Review.update(reviewId, payload);
      return Response.json({ review: updated });
    }

    const created = await base44.entities.Review.create(payload);
    return Response.json({ review: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}