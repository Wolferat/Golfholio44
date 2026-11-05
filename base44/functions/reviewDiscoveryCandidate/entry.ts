import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { SHERMAN_IMPORT_CENTER } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';
import { collectVerifiedPhotos } from '../../shared/officialSourceVerification.ts';

// ============================================================
// reviewDiscoveryCandidate — admin-only approval of one verified
// discovery candidate.
//
// approve: re-runs EVERY gate against the live official page first.
//   An approval never rests on stale evidence — if the page no longer
//   corroborates the venue, approval is refused and the reason is
//   returned. On success the listing is published and its verified
//   official photos are attached.
// reject: records the admin decision and keeps the venue hidden.
// ============================================================

function asItems(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

function parseJson(value: any): any {
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidate_id || '').trim();
    const action = String(body.action || '').trim();
    if (!candidateId) return Response.json({ error: 'candidate_id is required' }, { status: 400 });
    if (action !== 'approve' && action !== 'reject') {
      return Response.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const candidate = await base44.asServiceRole.entities.DiscoveryCandidate
      .get(candidateId)
      .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
    if (!candidate) return Response.json({ error: 'Candidate not found' }, { status: 404 });

    const now = new Date().toISOString();

    if (action === 'reject') {
      const reason = String(body.reason || '').slice(0, 200);
      const updated = await base44.asServiceRole.entities.DiscoveryCandidate.update(candidateId, {
        status: 'rejected',
        private_reason: `admin rejected${reason ? `: ${reason}` : ''}`,
        verified_at: now,
      });
      return Response.json({ rejected: true, candidate: updated });
    }

    if (candidate.status === 'accepted' && candidate.listing_id) {
      return Response.json(
        { error: 'already_approved', listing_id: candidate.listing_id },
        { status: 409 }
      );
    }

    const placesKey = secrets.get('GOOGLE_PLACES_API_KEY') || '';
    const evidence = parseJson(candidate.evidence_json);

    let radiusMi = 30;
    if (candidate.job_id) {
      const job = await base44.asServiceRole.entities.DiscoveryJob.get(candidate.job_id).catch(() => null);
      radiusMi = Number(job?.radius_miles) || 30;
    }

    const existingListings = asItems(
      await base44.asServiceRole.entities.Listing
        .filter({ status: { $nin: ['archived', 'rejected', 'flagged'] } })
        .catch(() => [])
    );

    const verified = await verifyLeadAgainstOfficialSource({
      lead: {
        name: candidate.name,
        category: candidate.discovery_category,
        city: candidate.city,
        state: candidate.state,
        address: candidate.address,
        website: candidate.official_website,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        phone: '',
      },
      placesKey,
      center: SHERMAN_IMPORT_CENTER,
      radiusMi,
      existingListings,
      searchEvidenceUrls: evidence?.search?.evidence_urls || [],
      jobId: candidate.job_id,
      nowIso: now,
    });

    const ev = verified.evaluation;
    if (ev.status !== 'accepted' || !ev.listing) {
      return Response.json(
        { error: `not_approvable: ${ev.reason}`, status: ev.status, checks: ev.checks },
        { status: 409 }
      );
    }

    const listing = await base44.asServiceRole.entities.Listing.create(ev.listing);

    let acceptedPhotos: any[] = [];
    if (verified.doc?.ok) {
      const photoResult = await collectVerifiedPhotos(verified.doc.html, verified.doc.finalUrl);
      acceptedPhotos = photoResult.accepted;
    }

    if (acceptedPhotos.length > 0) {
      await base44.asServiceRole.entities.OfficialPhoto.bulkCreate(
        acceptedPhotos.map((p, i) => ({
          listing_id: listing.id,
          listing_name: listing.name,
          photo_url: p.photo_url,
          source_url: p.source_url,
          source_provider: 'official_website',
          attribution: p.attribution,
          validation_status: 'accepted',
          validation_result: p.reason,
          validation_time: now,
          retry_count: 0,
          is_cover: i === 0,
          display_order: i,
        }))
      );

      await base44.asServiceRole.entities.Listing.update(listing.id, {
        photos: acceptedPhotos.map((p) => p.photo_url),
        photo_verified: true,
        photo_source: 'official_website',
        photo_source_url: ev.listing.official_website,
      });
    }

    const updatedCandidate = await base44.asServiceRole.entities.DiscoveryCandidate.update(candidateId, {
      status: 'accepted',
      listing_id: listing.id,
      address: verified.lead.address || candidate.address || '',
      city: verified.lead.city || candidate.city || '',
      state: verified.lead.state || candidate.state || '',
      latitude: ev.coordinates?.lat ?? null,
      longitude: ev.coordinates?.lng ?? null,
      distance_miles: ev.distanceMiles ?? candidate.distance_miles ?? null,
      private_reason: 'approved by admin',
      photos_json: JSON.stringify(acceptedPhotos.map((p) => p.photo_url)),
      evidence_json: JSON.stringify({
        checks: ev.checks,
        search: evidence?.search || null,
        address_resolution: verified.resolved
          ? { method: verified.resolved.method, address: verified.resolved.address }
          : null,
        approved_by: user.id,
        approved_at: now,
      }).slice(0, 9000),
      verified_at: now,
    });

    return Response.json({
      approved: true,
      listing,
      candidate: updatedCandidate,
      photos: acceptedPhotos.length,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}