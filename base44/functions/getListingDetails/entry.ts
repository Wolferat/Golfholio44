import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import {
  evaluatePublicListing,
  publicPhoto,
  EVENT_TYPES,
} from '../../shared/publicListingPolicy.ts';

// ============================================================
// Server-side listing detail endpoint — hardened.
//
// Applies the SAME shared policy before returning any listing
// by ID. A direct route, shared link, guessed ID, browser
// history entry, saved item, or API request cannot reveal an
// out-of-radius or unverified record.
//
// Returns:
//   - accepted official venue photos (from OfficialPhoto entity)
//   - approved player reviews (sanitized, with signed photo URLs)
//   - the current user's own review (any status, with signed
//     photo URL + photo_uri for editing)
//
// Defense in depth: signed URLs for review photos are ONLY
// created when the photo_uri has a matching ReviewPhotoUpload
// record owned by the review's author. This prevents a photo
// without an ownership record (e.g., set via direct entity
// access) from being served.
//
// Signed-out users receive { item: null }.
// Authenticated out-of-radius users receive { item: null }.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}
    if (!user) return Response.json({ item: null });

    const body = await req.json().catch(() => ({}));
    const id = (body.id || '').trim();
    if (!id) return Response.json({ item: null });

    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();

    let centerLat = null;
    let centerLng = null;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      centerLat = lat;
      centerLng = lng;
    } else if (near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) {
          centerLat = g.lat;
          centerLng = g.lng;
        }
      }
    }
    if (centerLat == null || centerLng == null) return Response.json({ item: null });

    const record = await base44.asServiceRole.entities.Listing.get(id).catch(() => null);
    if (!record) return Response.json({ item: null });

    const ev = evaluatePublicListing(record, centerLat, centerLng);
    if (!ev) return Response.json({ item: null });

    // Fetch accepted official photos from the OfficialPhoto entity (admin-only RLS)
    const officialPhotos = await base44.asServiceRole.entities.OfficialPhoto
      .filter({ listing_id: id, validation_status: 'accepted' }, 'display_order', 3)
      .catch(() => []);

    const officialPhotoData = officialPhotos.map((p) => ({
      url: p.photo_url,
      attribution: p.attribution,
      source: p.source_provider,
    }));

    // Prefer OfficialPhoto entity; fall back to legacy publicPhoto(record)
    const heroPhoto = officialPhotoData.length > 0
      ? officialPhotoData[0].url
      : publicPhoto(record);

    // Fetch approved reviews (service role — bypasses RLS)
    const approvedReviewsRaw = await base44.asServiceRole.entities.Review
      .filter({ listing_id: id, status: 'approved' }, '-created_date', 50)
      .catch(() => []);

    // Fetch the current user's own review (any status)
    const myReviewsRaw = await base44.asServiceRole.entities.Review
      .filter({ listing_id: id, created_by_id: user.id }, '-created_date', 1)
      .catch(() => []);

    // --- Defense in depth: fetch ReviewPhotoUpload records for this listing ---
    // A signed URL is only created when the review's photo_uri has a matching
    // upload record owned by the review's author. This prevents photos
    // without ownership records (e.g., set via direct entity access) from
    // being served to other players.
    const uploadRecords = await base44.asServiceRole.entities.ReviewPhotoUpload
      .filter({ listing_id: id }, '-created_date', 100)
      .catch(() => []);

    const uploadMap = new Map();
    for (const u of uploadRecords) {
      uploadMap.set(u.file_uri, u.uploaded_by_id);
    }

    // Create signed URL with ownership verification
    const createSignedUrl = async (review) => {
      if (!review.photo_uri) return null;
      const ownerId = uploadMap.get(review.photo_uri);
      if (!ownerId || ownerId !== review.created_by_id) return null; // no ownership = no signed URL
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: review.photo_uri,
          expires_in: 3600,
        });
        return signed?.signed_url || null;
      } catch {
        return null;
      }
    };

    // Sanitize approved reviews (no photo_uri exposed to other players)
    const reviews = [];
    for (const r of approvedReviewsRaw) {
      const photoUrl = await createSignedUrl(r);
      reviews.push({
        id: r.id,
        rating: r.rating,
        title: r.title || null,
        body: r.body,
        visit_date: r.visit_date || null,
        author_name: r.author_name || 'Golfer',
        created_date: r.created_date,
        photo_url: photoUrl,
      });
    }

    // Sanitize the user's own review (includes photo_uri for editing)
    let myReview = null;
    if (myReviewsRaw.length > 0) {
      const r = myReviewsRaw[0];
      const photoUrl = await createSignedUrl(r);
      myReview = {
        id: r.id,
        rating: r.rating,
        title: r.title || null,
        body: r.body,
        visit_date: r.visit_date || null,
        author_name: r.author_name || 'Golfer',
        created_date: r.created_date,
        status: r.status,
        moderation_note: r.moderation_note || null,
        photo_url: photoUrl,
        photo_uri: r.photo_uri || null,
      };
    }

    const startsAt = record.starts_at || null;
    const endsAt = record.ends_at || null;
    const isLive =
      EVENT_TYPES.has(record.type) &&
      startsAt &&
      new Date(startsAt) <= new Date() &&
      (!endsAt || new Date(endsAt) >= new Date());

    return Response.json({
      item: {
        id: record.id,
        type: record.type,
        name: record.name,
        location: [record.venue_name, record.city].filter(Boolean).join(' · '),
        city: record.city,
        venue: record.venue_name,
        date: record.starts_at ? String(record.starts_at).slice(0, 10) : null,
        startsAt,
        endsAt,
        live: isLive,
        price: record.price_note,
        blurb: record.description,
        website: record.official_website || record.website,
        phone: record.phone,
        address: record.address,
        photo: heroPhoto,
        official_photos: officialPhotoData,
        rating: record.rating ?? null,
        distance: ev.distance,
        coords: true,
        is_professional_tournament: record.is_professional_tournament || false,
        official_registration_url: record.official_registration_url || null,
        reviews,
        my_review: myReview,
      },
    });
  } catch (error) {
    return Response.json({ item: null });
  }
}