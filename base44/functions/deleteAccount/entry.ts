import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const uid = user.id;
    const svc = base44.asServiceRole;

    // Delete all player-owned data across every entity. Service role bypasses
    // RLS so admin-gated deletes (ReviewPhotoUpload, AvatarUpload, Report)
    // are cleaned up alongside user-deletable records.
    await svc.entities.Round.deleteMany({ created_by_id: uid });
    await svc.entities.SavedListing.deleteMany({ created_by_id: uid });
    await svc.entities.GolferProfile.deleteMany({ created_by_id: uid });
    await svc.entities.PlayerNotification.deleteMany({ target_user_id: uid });
    await svc.entities.PlayerNotificationPreference.deleteMany({ created_by_id: uid });
    await svc.entities.DeviceSubscription.deleteMany({ created_by_id: uid });
    await svc.entities.Review.deleteMany({ created_by_id: uid });
    await svc.entities.ReviewPhotoUpload.deleteMany({ uploaded_by_id: uid });
    await svc.entities.AvatarUpload.deleteMany({ uploaded_by_id: uid });
    await svc.entities.Friendship.deleteMany({ $or: [{ created_by_id: uid }, { addressee_id: uid }] });
    await svc.entities.Report.deleteMany({ created_by_id: uid });
    await svc.entities.PhotoContribution.deleteMany({ created_by_id: uid });
    await svc.entities.TeeTime.deleteMany({ created_by_id: uid });
    await svc.entities.Scorecard.deleteMany({ created_by_id: uid });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}