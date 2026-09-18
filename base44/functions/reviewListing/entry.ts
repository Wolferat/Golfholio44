import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const VALID_ACTIONS = new Set(['approve', 'reject', 'archive', 'flag', 'expire', 'claim']);

const STATUS_MAP = {
  approve: 'approved',
  reject: 'rejected',
  archive: 'archived',
  flag: 'flagged',
  expire: 'expired',
  claim: 'claimed',
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { listingId, action, notes } = body;

    if (!listingId || !action || !VALID_ACTIONS.has(action)) {
      return Response.json({ error: 'Invalid action. Use: approve, reject, archive, flag, expire, or claim' }, { status: 400 });
    }

    const update = {
      status: STATUS_MAP[action],
      verified_at: new Date().toISOString(),
      verified_by: user.id,
    };
    if (notes) update.verification_notes = notes;

    // Keep the approval workflow consistent with the public-listing policy
    // (rule 7: source_url must be a valid https/http URL). On approve, if the
    // record has no source_url, populate it from the official website fields
    // so an approved+verified record is not silently blocked from the feed.
    if (action === 'approve') {
      const existing = await base44.asServiceRole.entities.Listing.get(listingId).catch(() => null);
      if (existing && !existing.source_url) {
        const official = existing.official_website || existing.official_registration_url || existing.website;
        if (official) update.source_url = official;
      }
    }

    const updated = await base44.asServiceRole.entities.Listing.update(listingId, update);
    return Response.json({ success: true, listing: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}