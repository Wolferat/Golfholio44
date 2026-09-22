import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ============================================================
// Get Notifications — player-facing, private.
//
// Returns the authenticated player's own notifications, sorted
// newest-first. Also returns an unread count for badge display.
//
// RLS on PlayerNotification restricts read to target_user_id
// matching the caller, so only the intended player's notifications
// are returned. Admins can also read (for oversight).
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const items = await base44.entities.PlayerNotification
      .list('-created_date', 50)
      .catch(() => []);

    const unreadCount = items.filter((n: any) => !n.read).length;

    return Response.json({
      items: items.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        area_key: n.area_key || null,
        city: n.city || null,
        state: n.state || null,
        deep_link: n.deep_link || null,
        read: !!n.read,
        created_date: n.created_date,
      })),
      unreadCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}