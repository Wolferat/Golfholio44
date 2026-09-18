import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveConfirmedSourceUrl } from '../../shared/approvalPolicy.ts';

const VALID_ACTIONS = new Set(['approve', 'reject', 'archive', 'flag', 'expire', 'claim']);

const STATUS_MAP = {
  approve: 'approved',
  reject: 'rejected',
  archive: 'archived',
  flag: 'flagged',
  expire: 'expired',
  claim: 'claimed',
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { listingId, action, notes } = body;

    if (!listingId || !action || !VALID_ACTIONS.has(action)) {
      return Response.json(
        { error: 'Invalid action. Use: approve, reject, archive, flag, expire, or claim' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const update = {
      status: STATUS_MAP[action],
      verified_at: now,
      verified_by: user.id,
    };
    if (notes) update.verification_notes = notes;

    let confirmedSourceUrl = null;

    if (action === 'approve') {
      const existing = await base44.asServiceRole.entities.Listing.get(listingId).catch(() => null);
      if (!existing) {
        return Response.json({ error: 'Listing not found' }, { status: 404 });
      }

      // Approval requires a confirmed official source URL. A generic
      // `website` field is never accepted. If no confirmed source is
      // provided, the approval FAILS and no record is modified.
      const confirmed = resolveConfirmedSourceUrl(existing, body);
      if (!confirmed.ok) {
        return Response.json({ error: confirmed.reason }, { status: 400 });
      }
      confirmedSourceUrl = confirmed.sourceUrl;
      update.source_url = confirmedSourceUrl;

      // Approval is the admin's confirmation that this is a golf venue.
      update.golf_verified = true;
      update.golf_verified_at = now;
      update.golf_verified_by = user.id;

      // Preserve an existing valid tier, otherwise default to tier 1.
      const t = existing.verification_tier;
      update.verification_tier = t === 1 || t === 2 || t === 3 || t === 4 ? t : 1;
    }

    const updated = await base44.asServiceRole.entities.Listing.update(listingId, update);
    return Response.json({
      success: true,
      listing: updated,
      confirmedSourceUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}