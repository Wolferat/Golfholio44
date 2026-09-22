import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ============================================================
// Get / Set Notification Preference — player-facing, private.
//
// GET (no push_enabled in body): returns the player's current
//   push notification opt-in preference. Default false.
// SET (push_enabled in body): creates or updates the preference.
//
// The preference is explicit opt-in only. It is NEVER prompted
// on launch, signup, or first search. A future permission prompt
// may appear after the player has received value and chooses
// "Notify me when verified golf is found here."
//
// DeviceSubscription entities (future push tokens) are NOT
// created or activated in this pass.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // SET: push_enabled is explicitly present in the body.
    if (body.push_enabled !== undefined) {
      const pushEnabled = !!body.push_enabled;
      const existing = await base44.entities.PlayerNotificationPreference
        .list('-created_date', 5)
        .catch(() => []);

      if (existing.length > 0) {
        await base44.entities.PlayerNotificationPreference.update(existing[0].id, {
          push_enabled: pushEnabled,
        });
      } else {
        await base44.entities.PlayerNotificationPreference.create({
          push_enabled: pushEnabled,
        });
      }

      return Response.json({ push_enabled: pushEnabled });
    }

    // GET: return current preference.
    const existing = await base44.entities.PlayerNotificationPreference
      .list('-created_date', 5)
      .catch(() => []);

    return Response.json({
      push_enabled: existing.length > 0 ? !!existing[0].push_enabled : false,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}