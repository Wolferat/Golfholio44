import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { geocode, haversineMi } from '../../shared/googlePlaces.ts';
import { areaKey, isWithinPlayerRateLimit, safeCoverageStatus, FRESHNESS_WINDOW_MS } from '../../shared/coverageArea.ts';

// ============================================================
// requestCoverage — player-facing.
//
// Creates or joins a deduplicated server-side coverage request for
// the player's selected area. Does NOT trigger discovery directly.
// Discovery is performed by runCoverageDiscovery (admin-triggered
// or workflow-triggered, NOT activated during this build).
//
// Returns safe status only: { status, areaLabel, verifiedCount, areaKey }
// Never returns raw candidates, audit data, or internal sources.
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
    const city = (body.city || '').trim();
    const state = (body.state || '').trim();
    const radius = Math.min(Math.max(Number(body.radius) || 15, 1), 30);

    // Resolve coordinates from near if lat/lng not provided
    if ((lat == null || lng == null) && near) {
      const key = secrets.get('GOOGLE_PLACES_API_KEY');
      if (key) {
        const g = await geocode(key, near);
        if (g) { lat = g.lat; lng = g.lng; }
      }
    }

    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'Location required' }, { status: 400 });
    }

    const key = areaKey(lat, lng);
    const areaLabel = city && state ? `${city}, ${state}` : (near || `${lat.toFixed(2)}, ${lng.toFixed(2)}`);

    // Per-player abuse control: count NEW coverage requests in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const playerRequests = await base44.asServiceRole.entities.CoverageRequest
      .filter({ requested_by_id: user.id })
      .catch(() => []);
    const recentNewRequests = playerRequests.filter((r) =>
      r.first_requested_at && r.first_requested_at > oneHourAgo
    );

    // Find existing coverage request for this area (dedup)
    const existing = await base44.asServiceRole.entities.CoverageRequest
      .filter({ area_key: key })
      .catch(() => []);

    // Rate limit: only applies to NEW requests (not joining existing)
    if (existing.length === 0 && !isWithinPlayerRateLimit(recentNewRequests.length)) {
      return Response.json({
        status: 'rate_limited',
        areaLabel,
        verifiedCount: 0,
        areaKey: key,
        message: 'Too many area searches. Please try again in a few minutes.',
      });
    }

    let coverage;
    if (existing.length > 0) {
      // Join existing — increment request_count (dedup).
      // Freshness window: re-queue stale completed/empty results so
      // the area gets fresh discovery after 24h. Failed requests are
      // re-queued only after the server-controlled backoff expires.
      coverage = existing[0];
      const updates: any = {
        request_count: (coverage.request_count || 1) + 1,
      };

      if (coverage.status === 'complete' || coverage.status === 'empty') {
        const lastCompleted = coverage.last_completed_at
          ? new Date(coverage.last_completed_at).getTime()
          : 0;
        if (Date.now() - lastCompleted > FRESHNESS_WINDOW_MS) {
          updates.status = 'queued';
          updates.retry_count = (coverage.retry_count || 0) + 1;
        }
      } else if (coverage.status === 'failed') {
        const eligible = coverage.next_eligible_at
          ? new Date(coverage.next_eligible_at).getTime()
          : 0;
        if (Date.now() >= eligible) {
          updates.status = 'queued';
        }
      }

      await base44.asServiceRole.entities.CoverageRequest.update(coverage.id, updates)
        .catch(() => {});
      coverage = { ...coverage, ...updates };
    } else {
      // Count currently verified listings in this area for immediate display
      const allApproved = await base44.asServiceRole.entities.Listing
        .filter({ status: 'approved', golf_verified: true })
        .catch(() => []);
      let verifiedCount = 0;
      for (const l of allApproved) {
        if (l.latitude != null && l.longitude != null) {
          const dist = haversineMi(lat, lng, l.latitude, l.longitude);
          if (dist <= radius) verifiedCount++;
        }
      }

      // Create new coverage request
      coverage = await base44.asServiceRole.entities.CoverageRequest.create({
        area_key: key,
        area_label: areaLabel,
        canonical_city: city || null,
        canonical_state: state || null,
        latitude: lat,
        longitude: lng,
        radius_miles: radius,
        status: 'queued',
        requested_by_id: user.id,
        first_requested_at: new Date().toISOString(),
        request_count: 1,
        retry_count: 0,
        result_count: 0,
        accepted_count: 0,
        verified_count: verifiedCount,
      });
    }

    // Return safe status only — no raw candidates, no audit data
    return Response.json(safeCoverageStatus(coverage));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}