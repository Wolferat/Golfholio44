import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { isDuplicate } from '../../shared/googlePlaces.ts';

const EVENT_TYPES = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);

const UNTRUSTED_HOSTS = [
  'maps.google.com', 'google.com/maps', 'goo.gl', 'google.com/local',
  'yelp.com', 'tripadvisor.com', 'facebook.com', 'fb.com', 'm.facebook.com',
  'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'wikipedia.org', 'foursquare.com', 'yellowpages.com',
  'mapquest.com', 'bing.com/maps', 'apple.com/maps', 'superpages.com',
  'business.google.com', 'plus.google.com',
];

function isTrustedSourceUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return !UNTRUSTED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
  } catch {
    return false;
  }
}

// Automated listing verification.
// - Classifies golf relevance from structured evidence via LLM (not name keywords alone).
// - Confirms the official source URL (rejects Google Maps / directory / social).
// - Approves golf + trusted-source records, rejects non-golf / duplicates,
//   expires ended events, and keeps weakly-sourced golf records pending.
// - Skips already-verified approved records (e.g. the 6 manually approved).
// - Reports every change. dry_run returns the plan without writing.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);

    const all = await base44.asServiceRole.entities.Listing.filter({});
    // Candidates: pending, OR approved-but-unverified. Skip the 6 manually
    // verified (status=approved && golf_verified=true).
    const candidates = all
      .filter(
        (r) =>
          r.status === 'pending' ||
          (r.status === 'approved' &&
            (r.golf_verified !== true ||
              r.verification_tier === 5 ||
              !isTrustedSourceUrl(r.source_url)))
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
        // 1. Expire ended events.
        if (EVENT_TYPES.has(r.type) && r.ends_at && new Date(r.ends_at) < new Date()) {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'expired',
              verification_notes: 'auto-expired: event ended',
              verified_at: new Date().toISOString(),
              verified_by: user.id,
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'expired', reason: 'event ended' });
          expired++;
          continue;
        }

        // 2. LLM classification from structured evidence.
        const evidence = {
          name: r.name,
          type: r.type,
          address: r.address,
          city: r.city,
          state: r.state,
          website: r.website || r.official_website || null,
          source_url: r.source_url,
          place_id: r.place_id,
        };
        const prompt =
          'You are a strict golf-listing trust validator. Given the business evidence, decide:\n' +
          '1. is_golf: true only if this is a real golf venue (course, simulator, training facility, tournament, league, or clearly golf-related venue). Disc golf is NOT golf. Reject churches, schools, hotels, restaurants, medical, retail, government, adult/unsafe, and entertainment complexes without golf.\n' +
          '2. is_official_website: true only if the website field is the official venue/event website (not Google, Yelp, TripAdvisor, Facebook, Instagram, directories, or social).\n' +
          '3. recommended_tier: 1-4 confidence (4 highest). Use 0 if not golf.\n' +
          '4. reason: one short sentence.\n' +
          'Evidence: ' + JSON.stringify(evidence);
        const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              is_golf: { type: 'boolean' },
              is_official_website: { type: 'boolean' },
              recommended_tier: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['is_golf', 'is_official_website', 'recommended_tier', 'reason'],
          },
        });

        const tier = [1, 2, 3, 4].includes(llm.recommended_tier) ? llm.recommended_tier : 0;
        const officialUrl = r.official_website || r.website || '';
        const hasTrustedSource = llm.is_official_website && isTrustedSourceUrl(officialUrl);

        // 3. Non-golf → reject.
        if (!llm.is_golf || tier === 0) {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'rejected',
              verification_notes: 'auto-rejected: ' + llm.reason,
              verified_at: new Date().toISOString(),
              verified_by: user.id,
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'rejected', reason: llm.reason });
          rejected++;
          continue;
        }

        // 4. Golf but no trusted official source → keep pending (not public, not rejected).
        if (!hasTrustedSource) {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              verification_tier: tier,
              verification_notes: 'pending: ' + llm.reason + ' (no trusted official source)',
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'pending_source', tier, reason: 'golf but no trusted official source' });
          pendingSource++;
          continue;
        }

        // 5. Duplicate detection.
        const dup = isDuplicate({ ...r, website: officialUrl }, all.filter((e) => e.id !== r.id));
        if (dup.isDup) {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'rejected',
              verification_notes: 'auto-rejected: duplicate (' + dup.reason + ')',
              verified_at: new Date().toISOString(),
              verified_by: user.id,
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'rejected_dup', reason: dup.reason });
          rejected++;
          continue;
        }

        // 6. Approve.
        const now = new Date().toISOString();
        if (!dryRun) {
          await base44.asServiceRole.entities.Listing.update(r.id, {
            status: 'approved',
            golf_verified: true,
            golf_verified_at: now,
            golf_verified_by: user.id,
            verification_tier: tier,
            source_url: officialUrl,
            official_website: officialUrl,
            verified_at: now,
            verified_by: user.id,
            verification_notes: 'auto-verified: ' + llm.reason,
          });
        }
        changes.push({ id: r.id, name: r.name, action: 'approved', tier, source_url: officialUrl, reason: llm.reason });
        approved++;
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