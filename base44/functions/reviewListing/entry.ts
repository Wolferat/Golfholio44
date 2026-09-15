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

    const updated = await base44.asServiceRole.entities.Listing.update(listingId, update);
    return Response.json({ success: true, listing: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}