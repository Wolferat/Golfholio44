import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import {
  evaluateTournamentListing,
  formatTournamentDto,
  TOURNAMENT_TYPES,
} from '../../shared/tournamentPolicy.ts';

// ============================================================
// getTournaments — server-side tournament search endpoint.
//
// Returns ONLY verified, non-expired tournaments within the
// player's chosen location and radius. Every result passes
// the full tournament policy (base listing policy + tournament-
// specific rules). Returns a sanitized tournament DTO — never
// raw listing rows or private verification/audit fields.
//
// Authentication required. Location required (GPS or resolved
// city/ZIP). Radius: 15 default, 30 max, server-validated.
// Fail closed: any error → empty result set.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ items: [] });

    const body = await req.json().catch(() => ({}));
    const query = (body.query || '').trim();
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();
    const requestedRadius = Number(body.radius) || 15;
    const radius = Math.min(Math.max(requestedRadius, 1), 30);

    // Player location is REQUIRED — no silent default.
    let centerLat = null;
    let centerLng = null;

    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      centerLat = lat;
      centerLng = lng;
    } else if (near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) { centerLat = g.lat; centerLng = g.lng; }
      }
    }

    if (centerLat == null || centerLng == null) return Response.json({ items: [] });

    // Fetch all approved listings, filter to tournament categories only.
    let records = await base44.asServiceRole.entities.Listing.filter({ status: 'approved' });
    records = records.filter((r) => TOURNAMENT_TYPES.has(r.type));

    if (query) {
      const q = query.toLowerCase();
      records = records.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const items = [];
    for (const r of records) {
      const ev = evaluateTournamentListing(r, centerLat, centerLng, radius);
      if (!ev) continue;
      const dto = formatTournamentDto(r, ev.distance);
      if (dto) items.push(dto);
    }

    items.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      return 0;
    });

    return Response.json({ items, radius });
  } catch (error) {
    return Response.json({ items: [], radius: 15 });
  }
}