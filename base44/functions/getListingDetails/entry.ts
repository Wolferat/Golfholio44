import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import {
  evaluatePublicListing,
  publicPhoto,
  EVENT_TYPES,
} from '../../shared/publicListingPolicy.ts';

// ============================================================
// Server-side listing detail endpoint.
//
// Applies the SAME shared policy before returning any listing
// by ID. A direct route, shared link, guessed ID, browser
// history entry, saved item, or API request cannot reveal an
// out-of-radius or unverified record.
//
// Now also returns accepted official venue photos from the
// OfficialPhoto entity (preferred over legacy listing.photos).
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

    // Fetch accepted official photos from the OfficialPhoto entity
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
      },
    });
  } catch (error) {
    return Response.json({ item: null });
  }
}