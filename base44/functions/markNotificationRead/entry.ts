import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ============================================================
// Mark Notification Read / Clear — player-facing, private.
//
// Actions:
//   read      — mark a single notification as read (notification_id)
//   read_all  — mark all of the player's notifications as read
//   clear     — delete a single notification (notification_id)
//   clear_all — delete all of the player's notifications
//
// RLS restricts update/delete to target_user_id matching the
// caller, so a player can only modify their own notifications.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = (body.action || '').trim();
    const notificationId = (body.notification_id || '').trim();

    if (!action) return Response.json({ error: 'Action required' }, { status: 400 });

    if (action === 'read') {
      if (!notificationId) return Response.json({ error: 'notification_id required' }, { status: 400 });
      await base44.entities.PlayerNotification.update(notificationId, { read: true });
      return Response.json({ ok: true });
    }

    if (action === 'read_all') {
      const items = await base44.entities.PlayerNotification.list('-created_date', 50).catch(() => []);
      const unread = items.filter((n: any) => !n.read);
      if (unread.length > 0) {
        await base44.entities.PlayerNotification.bulkUpdate(
          unread.map((n: any) => ({ id: n.id, read: true }))
        );
      }
      return Response.json({ ok: true, updated: unread.length });
    }

    if (action === 'clear') {
      if (!notificationId) return Response.json({ error: 'notification_id required' }, { status: 400 });
      await base44.entities.PlayerNotification.delete(notificationId);
      return Response.json({ ok: true });
    }

    if (action === 'clear_all') {
      const items = await base44.entities.PlayerNotification.list('-created_date', 50).catch(() => []);
      if (items.length > 0) {
        await base44.entities.PlayerNotification.deleteMany(
          items.reduce((acc: any, n: any) => ({ ...acc, [n.id]: true }), {})
        );
      }
      return Response.json({ ok: true, deleted: items.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}