import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { decideVerification, corroborateSourceUrl } from '../../shared/automatedVerification.ts';
import { isTrustedSourceUrl } from '../../shared/publicListingPolicy.ts';
import { placeDetails, isGolfRelated, haversineMi } from '../../shared/googlePlaces.ts';
import { classifyOfficialVenue } from '../../shared/openaiVenueVerification.ts';
import { secrets } from 'base44:runtime';

// Automated listing verification.
//
// The LLM researches and classifies golf relevance (with web search),
// but it is NOT the sole authority. Approval requires independently
// validated evidence from decideVerification():
//   - golf-related (LLM research + name corroboration)
//   - category allowed (deterministic)
//   - source URL official/authoritative (deterministic, NOT LLM)
//   - source uses valid http/https (deterministic)
//   - source PAGE corroborates venue/event identity (deterministic
//     fetch + text match — not just a clean-looking domain)
//   - coordinates valid (deterministic)
//   - not a duplicate (deterministic)
//   - not an expired event (deterministic)
//   - not a non-golf/prohibited name (deterministic corroboration)
//
// If any evidence is uncertain, the listing stays pending (hidden) and
// the system retries/rechecks automatically later. A listing must NEVER
// become public based on a name, generic website, Google snippet, URL
// allow/deny list, or LLM confidence alone.
//
// dry_run returns the plan without writing.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const googleKey = secrets.get('GOOGLE_PLACES_API_KEY');
    const openaiKey = secrets.get('OPENAI_API_KEY');
    if (!googleKey || !openaiKey) {
      return Response.json({ error: 'Both Google Places and OpenAI server secrets are required' }, { status: 503 });
    }
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);

    const raw = await base44.asServiceRole.entities.Listing.filter({});
    // Deduplicate by ID
    const seenIds = new Set();
    const records = [];
    for (const r of raw) {
      if (!r.id || seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      records.push(r);
    }

    // Candidates: pending, OR approved-but-unverified.
    const candidates = records
      .filter(
        (r) =>
          r.status === 'pending' ||
          (r.status === 'approved' &&
            (r.golf_verified !== true ||
              r.verification_tier === 5 ||
              !r.source_url))
      )
      .slice(0, limit);

    let approved = 0;
    let rejected = 0;
    let pendingSource = 0;
    let expired = 0;
    let errors = 0;
    const changes = [];

    for (const r of candidates) {
      try {
        // Google identifies the place. OpenAI classifies only text from
        // the independently fetched and corroborated official website.
        const candidateSourceUrl = isTrustedSourceUrl(r.official_website)
          ? r.official_website
          : (isTrustedSourceUrl(r.source_url) ? r.source_url : '');
        const sourceCorroboration = candidateSourceUrl
          ? await corroborateSourceUrl(candidateSourceUrl, r, true)
          : null;
        const google = r.place_id
          ? await placeDetails(googleKey, r.place_id).catch(() => null)
          : null;
        const googleGolf = google && isGolfRelated(google).isGolf;
        let sameOfficialHost = false;
        try {
          sameOfficialHost = !!google?.website &&
            new URL(google.website).hostname.replace(/^www\./, '').toLowerCase() ===
            new URL(candidateSourceUrl).hostname.replace(/^www\./, '').toLowerCase();
        } catch {}
        const googleCoords = google?.geometry?.location;
        const sameLocation = Number.isFinite(googleCoords?.lat) &&
          Number.isFinite(googleCoords?.lng) &&
          Number.isFinite(r.latitude) && Number.isFinite(r.longitude) &&
          haversineMi(googleCoords.lat, googleCoords.lng, r.latitude, r.longitude) <= 1;
        const model = sourceCorroboration?.corroborated && googleGolf && sameOfficialHost && sameLocation
          ? await classifyOfficialVenue(openaiKey, sourceCorroboration.sourceText || '')
          : null;
        const supportedType = ['course', 'simulator', 'training', 'golf_related_venue'].includes(r.type);
        if (!supportedType || !googleGolf || !sameOfficialHost || !sameLocation ||
            !sourceCorroboration?.corroborated || !model || model.is_golf !== true ||
            model.category !== r.type) {
          const reason = 'Google, OpenAI, category, location, and official-source checks must all agree';
          changes.push({ id: r.id, name: r.name, action: 'pending', reason });
          pendingSource++;
          continue;
        }

        const recordForDecision = { ...r, source_url: candidateSourceUrl };
        const decision = decideVerification(
          recordForDecision,
          { is_golf: true, recommended_tier: 2, reason: model.reason },
          records,
          sourceCorroboration
        );

        const now = new Date().toISOString();
        if (decision.action === 'expired') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'expired',
              verification_notes: 'auto-expired: event ended',
              verified_at: now,
              verified_by: user.id,
              ingestion_source: 'automated_verification',
              ingestion_job_id: 'verifyListings',
              source_urls_considered: candidateSourceUrl || '',
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'expired', reason: 'event ended' });
          expired++;
        } else if (decision.action === 'rejected') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'rejected',
              verification_notes: 'auto-rejected: ' + decision.reasons.join('; '),
              verified_at: now,
              verified_by: user.id,
              ingestion_source: 'automated_verification',
              ingestion_job_id: 'verifyListings',
              source_urls_considered: candidateSourceUrl || '',
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'rejected', reason: decision.reasons.join('; ') });
          rejected++;
        } else if (decision.action === 'pending') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              verification_tier: decision.tier || null,
              verification_notes: 'pending: ' + decision.reasons.join('; '),
              ingestion_source: 'automated_verification',
              ingestion_job_id: 'verifyListings',
              source_urls_considered: candidateSourceUrl || '',
            });
          }
          changes.push({
            id: r.id, name: r.name, action: 'pending',
            reason: decision.reasons.join('; '),
            tier: decision.tier,
            sourceCorroboration: sourceCorroboration
              ? { corroborated: sourceCorroboration.corroborated, reason: sourceCorroboration.reason }
              : null,
          });
          pendingSource++;
        } else if (decision.action === 'approved') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'approved',
              golf_verified: true,
              golf_verified_at: now,
              golf_verified_by: user.id,
              verification_tier: decision.tier,
              source_url: candidateSourceUrl,
              official_website: r.official_website || candidateSourceUrl,
              verified_at: now,
              verified_by: user.id,
              verification_notes: 'auto-verified: ' + decision.reasons.join('; '),
              ingestion_source: 'automated_verification',
              ingestion_job_id: 'verifyListings',
              source_urls_considered: candidateSourceUrl,
            });
          }
          changes.push({
            id: r.id, name: r.name, action: 'approved',
            tier: decision.tier, source_url: candidateSourceUrl,
            reason: decision.reasons.join('; '),
            sourceCorroboration: sourceCorroboration
              ? { corroborated: true, reason: sourceCorroboration.reason, evidence: sourceCorroboration.evidence }
              : null,
          });
          approved++;
        }
      } catch (e) {
        errors++;
        changes.push({ id: r.id, name: r.name, action: 'error', reason: e.message });
      }
    }

    return Response.json({
      dry_run: dryRun,
      candidates: candidates.length,
      approved,
      rejected,
      pending_source: pendingSource,
      expired,
      errors,
      changes,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}