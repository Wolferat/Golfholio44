import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import {
  evaluatePublicListing,
  publicPhoto,
  EVENT_TYPES,
} from '../../shared/publicListingPolicy.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Require an authenticated player session for real listing data.
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}
    if (!user) return Response.json({ items: [] });

    const body = await req.json().catch(() => ({}));
    const category = body.category || 'all';
    const query = (body.query || '').trim();
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();

    // Player location is REQUIRED. No silent default to any fixed city.
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

    if (centerLat == null || centerLng == null) return Response.json({ items: [] });

    let records = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' });

    if (category && category !== 'all') {
      records = records.filter((r) => r.type === category);
    }
    if (query) {
      const q = query.toLowerCase();
      records = records.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.city || '').toLowerCase().includes(q) ||
          (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const items = [];
    for (const r of records) {
      const ev = evaluatePublicListing(r, centerLat, centerLng);
      if (!ev) continue;
      const startsAt = r.starts_at || null;
      const endsAt = r.ends_at || null;
      const isLive =
        EVENT_TYPES.has(r.type) &&
        startsAt &&
        new Date(startsAt) <= new Date() &&
        (!endsAt || new Date(endsAt) >= new Date());
      items.push({
        id: r.id,
        type: r.type,
        name: r.name,
        location: [r.venue_name, r.city].filter(Boolean).join(' · '),
        city: r.city,
        venue: r.venue_name,
        date: r.starts_at ? String(r.starts_at).slice(0, 10) : null,
        startsAt,
        endsAt,
        live: isLive,
        price: r.price_note,
        blurb: r.description,
        website: r.official_website || r.website,
        phone: r.phone,
        address: r.address,
        photo: publicPhoto(r),
        rating: r.rating ?? null,
        distance: ev.distance,
        coords: true,
        is_professional_tournament: r.is_professional_tournament || false,
        official_registration_url: r.official_registration_url || null,
      });
    }

    items.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      return 0;
    });

    return Response.json({ items });
  } catch (error) {
    // Fail closed: any error → empty result set.
    return Response.json({ items: [] });
  }
}