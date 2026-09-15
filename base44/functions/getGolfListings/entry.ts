import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { haversineMi, geocode, isLikelyNonGolfName } from '../../shared/googlePlaces.ts';

const SHERMAN = { lat: 33.6357, lng: -96.6086 };
const RADIUS_MI = 15;

const EVENT_TYPES = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const category = body.category || 'all';
    const query = (body.query || '').trim();
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();

    // Determine search center — default Sherman, TX
    let centerLat = SHERMAN.lat;
    let centerLng = SHERMAN.lng;

    if (lat != null && lng != null) {
      centerLat = lat;
      centerLng = lng;
    } else if (near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) { centerLat = g.lat; centerLng = g.lng; }
      }
    }

    // Public queries: approved listings only
    let records = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' });

    // 1:1 category mapping — category keys match entity type values
    if (category && category !== 'all') {
      records = records.filter((r) => r.type === category);
    }

    if (query) {
      const q = query.toLowerCase();
      records = records.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const now = new Date();
    const items = [];

    for (const r of records) {
      // Exclude expired events from public discovery
      if (EVENT_TYPES.has(r.type) && r.ends_at && new Date(r.ends_at) < now) continue;

      // Safety net: hide records with non-golf names even if incorrectly approved
      if (isLikelyNonGolfName(r.name)) continue;

      // Credible-source filter: hide approved records without a tier 1-4 verification source
      const hasCredibleSource =
        (r.verification_tier != null && r.verification_tier >= 1 && r.verification_tier <= 4) ||
        !!r.source_url ||
        !!r.official_website ||
        !!r.website;
      if (!hasCredibleSource) continue;

      // Enforce 15-mile radius server-side using coordinates
      if (r.latitude == null || r.longitude == null) continue;
      const distance = Math.round(haversineMi(centerLat, centerLng, r.latitude, r.longitude) * 10) / 10;
      if (distance > RADIUS_MI) continue;

      // Unverified-photo filter: hide unverified cover photos, keep listing visible with neutral fallback
      const hasVerifiedPhoto = r.photo_verified === true || !!r.photo_source_url;
      const publicPhoto = hasVerifiedPhoto && Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null;

      const startsAt = r.starts_at || null;
      const endsAt = r.ends_at || null;
      const isLive = EVENT_TYPES.has(r.type) && startsAt && new Date(startsAt) <= now && (!endsAt || new Date(endsAt) >= now);

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
        photo: publicPhoto,
        rating: r.rating ?? null,
        distance,
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
    return Response.json({ error: error.message }, { status: 500 });
  }
}