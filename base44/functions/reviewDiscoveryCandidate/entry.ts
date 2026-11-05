import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { SHERMAN_IMPORT_CENTER } from '../../shared/openaiDiscovery.ts';
import { verifyLeadAgainstOfficialSource } from '../../shared/candidateVerification.ts';
import { collectVerifiedPhotos } from '../../shared/officialSourceVerification.ts';
import { evaluatePlacesOnlyApproval } from '../../shared/placesAnchoredApproval.ts';
import { findPlaceAddress, placeDetails } from '../../shared/googlePlaces.ts';

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

    // A venue with no official website can never pass the official-source
    // gate. An admin may publish it explicitly from its Google Business
    // Profile instead. Every safety check that does not need a website
    // still runs (golf signal, place_id, street address, radius, dedupe).
    let publishRecord: any = ev.status === 'accepted' ? ev.listing : null;
    let publishCoords: any = ev.coordinates;
    let publishDistance: any = ev.distanceMiles;
    let publishChecks: any = ev.checks;

    if (!publishRecord) {
      if (body.allow_no_website !== true) {
        return Response.json(
          {
            error: `not_approvable: ${ev.reason}`,
            status: ev.status,
            checks: ev.checks,
            can_approve_without_website: !ev.checks?.find((c: any) => c.key === 'official_website_supported')?.pass,
          },
          { status: 409 }
        );
      }

      let placeId = String(evidence?.place_id || '').trim();
      let det: any = null;
      if (placesKey && placeId) det = await placeDetails(placesKey, placeId).catch(() => null);
      if (!placeId && placesKey) {
        const found = await findPlaceAddress(placesKey, candidate.name, candidate.city, candidate.state).catch(
          () => null
        );
        placeId = found?.place_id || '';
        if (placeId) det = await placeDetails(placesKey, placeId).catch(() => null);
      }

      const placesOnly = evaluatePlacesOnlyApproval({
        name: candidate.name,
        category: candidate.discovery_category,
        city: candidate.city,
        state: candidate.state,
        address: det?.formatted_address || candidate.address || '',
        phone: det?.formatted_phone_number || '',
        placeId,
        latitude: det?.geometry?.location?.lat ?? candidate.latitude ?? null,
        longitude: det?.geometry?.location?.lng ?? candidate.longitude ?? null,
        placeTypes: det?.types || [],
        center: SHERMAN_IMPORT_CENTER,
        radiusMi,
        existingListings,
        adminId: user.id,
        jobId: candidate.job_id,
        nowIso: now,
      });

      if (!placesOnly.ok) {
        return Response.json(
          { error: `not_approvable: ${placesOnly.reason}`, status: 'rejected', checks: placesOnly.checks },
          { status: 409 }
        );
      }

      publishRecord = placesOnly.listing;
      publishCoords = placesOnly.coordinates;
      publishDistance = placesOnly.distanceMiles;
      publishChecks = placesOnly.checks;
    }

    const listing = await base44.asServiceRole.entities.Listing.create(publishRecord);

    let acceptedPhotos: any[] = [];
    if (verified.doc?.ok) {
      const photoResult = await collectVerifiedPhotos(verified.doc.html, verified.doc.finalUrl);
      acceptedPhotos = photoResult.accepted;
    }

    if (acceptedPhotos.length > 0 && publishRecord.official_website) {
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
        photo_source_url: publishRecord.official_website,
      });
    }

    const updatedCandidate = await base44.asServiceRole.entities.DiscoveryCandidate.update(candidateId, {
      status: 'accepted',
      listing_id: listing.id,
      address: publishRecord.address || verified.lead.address || candidate.address || '',
      city: verified.lead.city || candidate.city || '',
      state: verified.lead.state || candidate.state || '',
      latitude: publishCoords?.lat ?? null,
      longitude: publishCoords?.lng ?? null,
      distance_miles: publishDistance ?? candidate.distance_miles ?? null,
      private_reason: 'approved by admin',
      photos_json: JSON.stringify(acceptedPhotos.map((p) => p.photo_url)),
      evidence_json: JSON.stringify({
        checks: publishChecks,
        approved_without_website: !publishRecord.official_website || false,
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