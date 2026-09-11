import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Maps frontend category keys to Listing entity type values
const CATEGORY_TO_TYPE = {
  course: 'course',
  simulator: 'simulator',
  charity: 'tournament',
  training: 'lesson',
};

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const category = body.category || 'all';
    const query = (body.query || '').trim();
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim().toLowerCase();

    let records = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' });

    const type = CATEGORY_TO_TYPE[category];
    if (type) records = records.filter((r) => r.type === type);

    if (query) {
      const q = query.toLowerCase();
      records = records.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const now = new Date();
    const items = records.map((r) => {
      const startsAt = r.starts_at || null;
      const endsAt = r.ends_at || null;
      const live = r.type === 'tournament' && startsAt && new Date(startsAt) <= now && (!endsAt || new Date(endsAt) >= now);
      let distance = null;
      if (lat != null && lng != null && r.latitude != null && r.longitude != null) {
        distance = Math.round(haversineMi(lat, lng, r.latitude, r.longitude) * 10) / 10;
      }
      return {
        id: r.id,
        type: r.type,
        name: r.name,
        location: [r.venue_name, r.city].filter(Boolean).join(' · '),
        city: r.city,
        venue: r.venue_name,
        date: r.starts_at ? String(r.starts_at).slice(0, 10) : null,
        startsAt: r.starts_at || null,
        endsAt: r.ends_at || null,
        live,
        price: r.price_note,
        blurb: r.description,
        website: r.website,
        phone: r.phone,
        address: r.address,
        photo: Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null,
        rating: r.rating ?? null,
        distance,
        coords: r.latitude != null && r.longitude != null,
      };
    });

    const nearMatch = (it) => near && it.city && it.city.toLowerCase().includes(near);
    items.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      const am = nearMatch(a) ? 0 : 1;
      const bm = nearMatch(b) ? 0 : 1;
      if (am !== bm) return am - bm;
      return 0;
    });

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}