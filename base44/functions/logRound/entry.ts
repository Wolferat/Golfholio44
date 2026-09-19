import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePublicListing } from '../../shared/publicListingPolicy.ts';

// ============================================================
// Venue-Linked Round Logging
//
// Authenticated players can log a real round at an eligible
// course or simulator listing. The listing must pass the public
// trust policy (non-location checks — using the listing's own
// coordinates so distance=0 is always within 15mi).
//
// Supports create and update (via round_id). Deletes are handled
// client-side through the entity SDK (RLS restricts to owner).
//
// Round data: venue link, date, 9 or 18 holes, score, optional
// note, optional format details. Used for the player's own
// venue-specific playing history and statistics.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const listingId = (body.listing_id || '').trim();
    const roundId = (body.round_id || '').trim();
    const date = (body.date || '').trim();
    const holes = Number(body.holes);
    const score = Number(body.score);
    const notes = (body.notes || '').trim();
    const format = (body.format || '').trim();
    const listingName = (body.listing_name || '').trim();
    const teeName = (body.tee_name || '').trim();
    const par = body.par != null ? Number(body.par) : null;
    const courseRating = body.course_rating != null ? Number(body.course_rating) : null;
    const slopeRating = body.slope_rating != null ? Number(body.slope_rating) : null;
    const adjustedGrossScore = body.adjusted_gross_score != null ? Number(body.adjusted_gross_score) : null;
    const pccAdjustment = body.pcc_adjustment != null ? Number(body.pcc_adjustment) : null;
    const ratingSource = (body.rating_source || '').trim();

    if (!listingId) return Response.json({ error: 'Listing required' }, { status: 400 });
    if (!date) return Response.json({ error: 'Date required' }, { status: 400 });
    if (holes !== 9 && holes !== 18) return Response.json({ error: 'Holes must be 9 or 18' }, { status: 400 });
    if (!Number.isFinite(score) || score < 1 || score > 300) {
      return Response.json({ error: 'Score must be between 1 and 300' }, { status: 400 });
    }

    // Verify listing eligibility (non-location policy checks)
    const record = await base44.asServiceRole.entities.Listing.get(listingId).catch(() => null);
    if (!record) return Response.json({ error: 'Listing not found' }, { status: 404 });

    if (record.latitude && record.longitude) {
      const ev = evaluatePublicListing(record, record.latitude, record.longitude);
      if (!ev) {
        return Response.json({ error: 'This listing is not eligible for rounds' }, { status: 403 });
      }
    } else {
      return Response.json({ error: 'This listing is not eligible for rounds' }, { status: 403 });
    }

    // Determine handicap eligibility: 18 holes + course rating + slope rating required
    const hasRatings = courseRating != null && slopeRating != null && Number.isFinite(courseRating) && Number.isFinite(slopeRating);
    const handicapEligible = holes === 18 && hasRatings;
    let eligibilityReason = null;
    if (!handicapEligible) {
      if (holes === 9) eligibilityReason = '9-hole rounds do not count toward the 18-hole estimate';
      else if (!hasRatings) eligibilityReason = 'missing Course Rating or Slope Rating';
    }

    const payload = {
      listing_id: listingId,
      listing_name: listingName || record.name || null,
      date,
      holes,
      score,
      notes: notes || null,
      format: format || null,
      tee_name: teeName || null,
      par: (par != null && Number.isFinite(par)) ? par : null,
      course_rating: (courseRating != null && Number.isFinite(courseRating)) ? courseRating : null,
      slope_rating: (slopeRating != null && Number.isFinite(slopeRating)) ? slopeRating : null,
      adjusted_gross_score: (adjustedGrossScore != null && Number.isFinite(adjustedGrossScore)) ? adjustedGrossScore : score,
      pcc_adjustment: (pccAdjustment != null && Number.isFinite(pccAdjustment)) ? pccAdjustment : 0,
      rating_source: ratingSource || null,
      handicap_eligible: handicapEligible,
      eligibility_reason: eligibilityReason,
    };

    if (roundId) {
      const updated = await base44.entities.RoundLog.update(roundId, payload);
      return Response.json({ round: updated });
    }

    const created = await base44.entities.RoundLog.create(payload);
    return Response.json({ round: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}