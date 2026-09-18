import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { evaluatePublicListing } from '../../shared/publicListingPolicy.ts';
import { discoverPhotosForListing } from '../../shared/photoValidation.ts';

// ============================================================
// Automated Official Photo Discovery
//
// Admin-only (also invoked by the scheduled workflow as service
// role). Finds eligible listings that are missing official photos
// or need a safe retry, fetches each listing's official website,
// extracts candidate images, validates each through SSRF + HTTP
// pre-check + LLM multi-signal safety/relevance/quality analysis,
// and stores up to 3 accepted photos per listing.
//
// Dry-run mode discovers and validates but stores nothing.
//
// Never makes a listing public — only enriches listings that are
// already eligible. Never uses user review photos as official
// venue imagery. Never shows uncertain imagery.
// ============================================================

const MAX_LISTINGS = 10;
const MAX_RETRY_HOURS = 168; // 7 days cap

function retryDelayHours(retryCount: number): number {
  const base = Math.pow(2, retryCount || 0);
  return Math.min(base, MAX_RETRY_HOURS);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;
    const limit = Math.min(Number(body.limit) || MAX_LISTINGS, MAX_LISTINGS);

    // 1. Load approved listings
    const allListings = await base44.asServiceRole.entities.Listing
      .filter({ status: 'approved' }, '-updated_date', 200)
      .catch(() => []);

    // 2. Filter to listings eligible for enrichment (non-location policy
    //    checks pass — use the listing's own coords so distance=0)
    const eligible = [];
    for (const record of allListings) {
      if (!record.latitude || !record.longitude) continue;
      const ev = evaluatePublicListing(record, record.latitude, record.longitude);
      if (!ev) continue;

      // Check existing OfficialPhoto records
      const existing = await base44.asServiceRole.entities.OfficialPhoto
        .filter({ listing_id: record.id }, '-created_date', 50)
        .catch(() => []);

      const hasAccepted = existing.some((p) => p.validation_status === 'accepted');
      if (hasAccepted) continue; // already has photos

      const retrying = existing.filter((p) => p.validation_status === 'retrying');
      if (retrying.length > 0) {
        const nextRetry = retrying
          .map((p) => p.next_retry_at ? new Date(p.next_retry_at) : new Date(0))
          .sort((a, b) => a - b)[0];
        if (nextRetry > new Date()) continue; // not due yet
      }

      eligible.push({ record, retryCount: retrying.length || 0 });
      if (eligible.length >= limit) break;
    }

    if (eligible.length === 0) {
      return Response.json({
        dry_run: dryRun,
        listings_checked: 0,
        summary: 'No eligible listings need photo discovery at this time.',
      });
    }

    const llmInvoke = (params) => base44.asServiceRole.integrations.Core.InvokeLLM(params);

    const results = [];
    let totalAccepted = 0;
    let totalRejected = 0;
    let totalErrors = 0;

    for (const { record, retryCount } of eligible) {
      const discovery = await discoverPhotosForListing(record, llmInvoke);

      const result = {
        listing_id: record.id,
        listing_name: record.name,
        website_used: discovery.website_used,
        candidates_checked: discovery.candidates_checked,
        accepted_count: discovery.accepted.length,
        rejected_count: discovery.rejected.length,
        fetch_error: discovery.fetch_error,
      };
      results.push(result);

      if (discovery.fetch_error) {
        totalErrors++;
      }

      if (dryRun) continue;

      // Store accepted photos
      for (let i = 0; i < discovery.accepted.length; i++) {
        const p = discovery.accepted[i];
        await base44.asServiceRole.entities.OfficialPhoto.create({
          listing_id: record.id,
          listing_name: record.name,
          photo_url: p.photo_url,
          source_url: p.source_url,
          source_provider: 'official_website',
          attribution: p.attribution,
          validation_status: 'accepted',
          validation_result: p.reason || 'accepted',
          validation_time: new Date().toISOString(),
          is_cover: i === 0,
          display_order: i,
        });
      }

      // Store rejected candidates (audit trail)
      for (const p of discovery.rejected) {
        await base44.asServiceRole.entities.OfficialPhoto.create({
          listing_id: record.id,
          listing_name: record.name,
          photo_url: p.photo_url,
          source_url: p.source_url,
          source_provider: 'official_website',
          attribution: p.attribution,
          validation_status: 'rejected',
          validation_result: p.reason || 'rejected',
          validation_time: new Date().toISOString(),
        });
      }

      totalAccepted += discovery.accepted.length;
      totalRejected += discovery.rejected.length;

      // If accepted photos found, update the listing
      if (discovery.accepted.length > 0) {
        const photoUrls = discovery.accepted.map((p) => p.photo_url);
        await base44.asServiceRole.entities.Listing.update(record.id, {
          photos: photoUrls,
          photo_verified: true,
          photo_source: 'official_website',
          photo_source_url: discovery.website_used,
        });
      } else if (discovery.fetch_error || discovery.candidates_checked === 0) {
        // No photos found — create a retry record with backoff
        const nextRetry = new Date(Date.now() + retryDelayHours(retryCount) * 3600 * 1000).toISOString();
        await base44.asServiceRole.entities.OfficialPhoto.create({
          listing_id: record.id,
          listing_name: record.name,
          photo_url: '',
          source_url: discovery.website_used || '',
          source_provider: 'official_website',
          attribution: '',
          validation_status: 'retrying',
          validation_result: discovery.fetch_error || 'no candidates found',
          validation_time: new Date().toISOString(),
          retry_count: retryCount + 1,
          next_retry_at: nextRetry,
        });
      }
    }

    return Response.json({
      dry_run: dryRun,
      listings_checked: eligible.length,
      total_accepted: totalAccepted,
      total_rejected: totalRejected,
      total_errors: totalErrors,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}