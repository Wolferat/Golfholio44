import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode } from '../../shared/googlePlaces.ts';
import { areaKey, safeCoverageStatus } from '../../shared/coverageArea.ts';

// ============================================================
// getCoverageStatus — player-facing, read-only.
//
// Returns safe coverage status for the player's selected area.
// Never returns raw candidates, audit data, exclusion reasons,
// source-extraction data, or internal controls.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let lat = body.lat != null ? Number(body.lat) : null;
    let lng = body.lng != null ? Number(body.lng) : null;
    const near = (body.near || '').trim();

    if ((lat == null || lng == null) && near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) { lat = g.lat; lng = g.lng; }
      }
    }

    if (lat == null || lng == null) {
      return Response.json(safeCoverageStatus(null));
    }

    const key = areaKey(lat, lng);
    const requests = await base44.asServiceRole.entities.CoverageRequest
      .filter({ area_key: key })
      .catch(() => []);

    if (requests.length === 0) {
      return Response.json(safeCoverageStatus(null));
    }

    return Response.json(safeCoverageStatus(requests[0]));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}