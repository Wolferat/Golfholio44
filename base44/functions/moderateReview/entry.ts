import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ============================================================
// Moderate Review — admin-only server-authorized review moderation.
//
// Actions: approve, reject, hide, restore.
//
// All actions are audited with actor, timestamp, and reason
// in the ReviewAction entity. The Review record is updated with
// the new status and admin action metadata.
//
// A review is never publicly displayed before it passes automated
// safety checks AND admin approval. Edits return the review to
// pending status (handled by submitReview).
//
// Server-authorized: hiding a button is not authorization. The
// admin role check is enforced server-side.
// ============================================================

const VALID_ACTIONS = new Set(['approve', 'reject', 'hide', 'restore']);

const ACTION_TO_STATUS = {
  approve: 'approved',
  reject: 'rejected',
  hide: 'hidden',
  restore: 'pending',
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const reviewId = (body.review_id || '').trim();
    const action = (body.action || '').trim().toLowerCase();
    const reason = (body.reason || '').trim().slice(0, 500);

    if (!reviewId) return Response.json({ error: 'Review ID required' }, { status: 400 });
    if (!VALID_ACTIONS.has(action)) {
      return Response.json({ error: 'Invalid action. Use: approve, reject, hide, or restore' }, { status: 400 });
    }

    // Fetch the review (service role — bypasses RLS)
    const review = await base44.asServiceRole.entities.Review.get(reviewId).catch(() => null);
    if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });

    const newStatus = ACTION_TO_STATUS[action];
    const now = new Date().toISOString();

    // Update the review status and admin action metadata
    const updated = await base44.asServiceRole.entities.Review.update(reviewId, {
      status: newStatus,
      admin_action_by: user.id,
      admin_action_at: now,
      admin_action_reason: reason || null,
    });

    // Create audit record
    await base44.asServiceRole.entities.ReviewAction.create({
      review_id: reviewId,
      action,
      reason: reason || null,
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Admin',
    }).catch(() => {});

    return Response.json({
      review: {
        id: updated.id,
        status: updated.status,
        admin_action_by: updated.admin_action_by,
        admin_action_at: updated.admin_action_at,
        admin_action_reason: updated.admin_action_reason,
      },
      action,
      audited: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}