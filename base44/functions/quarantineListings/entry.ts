import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { classifyExistingListing } from '../../shared/listingQuarantine.ts';

// ============================================================
// quarantineListings — admin-only cleanup of records imported
// before the trust gate existed.
//
// Actions:
//   preview — classifies every listing, writes nothing.
//   apply   — archives the out-of-scope and non-golf records.
//
// Archiving is the quarantine: `archived` is a hidden status in the
// public listing policy, so the record stops reaching players and
// stops blocking deduplication, while remaining fully recoverable.
//
// Ambiguous records (no golf vocabulary, no trusted source) are
// reported but never archived — real venues are named that way.
//
// Offline and deterministic: no API calls, no spend.
// ============================================================

async function loadAllListings(base44: any): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await base44.asServiceRole.entities.Listing.list({ limit: 200, cursor });
    const items = Array.isArray(res) ? res : res?.items || [];
    all.push(...items);
    cursor = Array.isArray(res) ? undefined : res?.next_cursor;
    if (!cursor || items.length === 0) break;
  }
  return all;
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
    const action = String(body.action || 'preview').trim();
    if (action !== 'preview' && action !== 'apply') {
      return Response.json({ error: 'unknown_action' }, { status: 400 });
    }

    const listings = await loadAllListings(base44);

    const byTier: Record<string, number> = { out_of_scope: 0, non_golf: 0, ambiguous: 0 };
    const reasonGroups: Record<string, string[]> = {};
    const ambiguous: string[] = [];
    const archivedAlready: string[] = [];

    for (const listing of listings) {
      const verdict = classifyExistingListing(listing);

      if (verdict.tier === 'ambiguous') {
        byTier.ambiguous++;
        if (ambiguous.length < 25) ambiguous.push(listing.name || '(unnamed)');
        continue;
      }

      if (!verdict.archive) continue;

      byTier[verdict.tier] = (byTier[verdict.tier] || 0) + 1;

      // Already quarantined in an earlier pass — idempotent.
      if (listing.status === 'archived') {
        archivedAlready.push(listing.id);
        continue;
      }

      const key = verdict.reason.slice(0, 120);
      if (!reasonGroups[key]) reasonGroups[key] = [];
      reasonGroups[key].push(listing.id);
    }

    const toArchive = Object.values(reasonGroups).reduce((sum, ids) => sum + ids.length, 0);

    const report = {
      action,
      total_listings: listings.length,
      quarantine_count: toArchive,
      already_archived: archivedAlready.length,
      ambiguous_count: byTier.ambiguous,
      kept_count: listings.length - toArchive - byTier.ambiguous - archivedAlready.length,
      by_tier: byTier,
      reasons: Object.entries(reasonGroups)
        .map(([reason, ids]) => ({ reason, count: ids.length }))
        .sort((a, b) => b.count - a.count),
      ambiguous_sample: ambiguous,
    };

    if (action === 'preview') {
      return Response.json({ ...report, dry_run: true, writes_made: 0 });
    }

    // Grouped writes: one updateMany per distinct reason, so the audit
    // reason is stored verbatim on every record it applies to.
    const now = new Date().toISOString();
    let archived = 0;
    for (const [reason, ids] of Object.entries(reasonGroups)) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await base44.asServiceRole.entities.Listing.updateMany(
          { id: { $in: chunk } },
          {
            $set: {
              status: 'archived',
              verification_notes: `quarantined: ${reason}`.slice(0, 300),
              verified_at: now,
              verified_by: user.email || user.id,
              golf_verified: false,
            },
          }
        );
        archived += chunk.length;
      }
    }

    return Response.json({ ...report, archived_count: archived, writes_made: archived });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}