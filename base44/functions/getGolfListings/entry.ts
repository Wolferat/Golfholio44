import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { restGet } from '../../shared/supabase.js';

const KIND_FILTER = {
  course: 'course',
  simulator: 'simulator',
  charity: 'charity',
  training: 'training',
};

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function avgRating(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return null;
  const vals = reviews.map((r) => (r && typeof r.rating === 'number' ? r.rating : null)).filter((v) => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function firstPhoto(photos) {
  if (!Array.isArray(photos) || !photos.length) return null;
  const p = photos[0];
  if (!p) return null;
  if (typeof p === 'string') return p;
  if (typeof p === 'object') return p.url || p.file_url || p.path || null;
  return null;
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

    let qs = 'select=id,title,kind,city,starts_at,ends_at,price_note,description,venue_name,official_website,phone,address,latitude,longitude,photos,reviews&status=eq.approved&order=created_at.desc&limit=60';
    const kind = KIND_FILTER[category];
    if (kind) qs += `&kind=eq.${kind}`;

    let rows = await restGet(base44, 'listings', qs);

    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const now = new Date();
    const items = rows.map((r) => {
      const startsAt = r.starts_at ? new Date(r.starts_at) : null;
      const endsAt = r.ends_at ? new Date(r.ends_at) : null;
      const live = r.kind === 'charity' && startsAt && startsAt <= now && (!endsAt || endsAt >= now);
      let distance = null;
      if (lat != null && lng != null && r.latitude != null && r.longitude != null) {
        distance = Math.round(haversineMi(lat, lng, r.latitude, r.longitude) * 10) / 10;
      }
      return {
        id: r.id,
        type: r.kind,
        name: r.title,
        location: [r.venue_name, r.city].filter(Boolean).join(' · '),
        city: r.city,
        venue: r.venue_name,
        date: r.starts_at ? String(r.starts_at).slice(0, 10) : null,
        startsAt: r.starts_at || null,
        endsAt: r.ends_at || null,
        live,
        price: r.price_note,
        blurb: r.description,
        website: r.official_website,
        phone: r.phone,
        address: r.address,
        photo: firstPhoto(r.photos),
        rating: avgRating(r.reviews),
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