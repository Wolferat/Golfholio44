import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { decideVerification, corroborateSourceUrl } from '../../shared/automatedVerification.ts';

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
        // 1. LLM research (with web search) — classifies golf relevance.
        //    The LLM is NOT the sole authority. It researches and classifies;
        //    deterministic evidence validation makes the final decision.
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
          'You are a golf-listing research assistant. Research the following business online and classify it.\n' +
          '1. is_golf: true only if this is a real golf venue (course, simulator, training facility, tournament, league, or clearly golf-related venue). Disc golf is NOT golf. Reject churches, schools, hotels, restaurants, medical, retail, government, adult/unsafe, and entertainment complexes without golf.\n' +
          '2. recommended_tier: 1-4 confidence (4 highest). Use 0 if not golf.\n' +
          '3. reason: one short sentence citing the evidence you found.\n' +
          'Evidence: ' + JSON.stringify(evidence);
        const llm = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          model: 'gemini_3_flash',
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              is_golf: { type: 'boolean' },
              recommended_tier: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['is_golf', 'recommended_tier', 'reason'],
          },
        });

        // 2. Determine candidate source URL (deterministic, NOT from LLM).
        //    Only source_url or official_website may be trusted — never the
        //    generic website field (typically Google Places).
        const candidateSourceUrl = r.source_url || r.official_website || '';
        const recordForDecision = { ...r, source_url: candidateSourceUrl };

        // 3. Corroborate the source URL against the venue identity.
        //    Fetch the page, check for redirect mismatch, and verify the
        //    page contains the venue name + at least one stable fact.
        let sourceCorroboration = null;
        if (candidateSourceUrl) {
          sourceCorroboration = await corroborateSourceUrl(candidateSourceUrl, r);
        }

        // 4. Automated decision: LLM classifies, deterministic evidence validates.
        const decision = decideVerification(recordForDecision, llm, records, sourceCorroboration);

        const now = new Date().toISOString();
        if (decision.action === 'expired') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              status: 'expired',
              verification_notes: 'auto-expired: event ended',
              verified_at: now,
              verified_by: user.id,
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
            });
          }
          changes.push({ id: r.id, name: r.name, action: 'rejected', reason: decision.reasons.join('; ') });
          rejected++;
        } else if (decision.action === 'pending') {
          if (!dryRun) {
            await base44.asServiceRole.entities.Listing.update(r.id, {
              verification_tier: decision.tier || null,
              verification_notes: 'pending: ' + decision.reasons.join('; '),
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