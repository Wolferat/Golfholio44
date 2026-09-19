import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  sanitizePublicProfile,
  getDefaultAvatarUrl,
} from '../../shared/playerProfile.ts';

// ============================================================
// getPlayerProfile — returns public-safe player profile data.
//
// Any signed-in player can request a public profile by user_id
// or username. The response contains ONLY public fields:
//   username, display_name, bio, avatar_url, avatar_source
//
// Never exposed: email, phone, first_name, last_name, home_city,
// home_state, avatar_uri, notifications, privacy, or any
// private preference.
//
// Avatar URLs:
//   - upload: fresh signed URL created server-side (1-hour expiry)
//   - default: public CDN URL from the default avatar set
//   - initials: null (client renders initials fallback)
// ============================================================

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Require an authenticated player session
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetUserId = (body.user_id || '').toString().trim();
    const targetUsername = (body.username || '').toString().trim().toLowerCase();

    if (!targetUserId && !targetUsername) {
      return Response.json({ error: 'Provide user_id or username' }, { status: 400 });
    }

    // Load all profiles (service role) and find the target
    const allProfiles = await base44.asServiceRole.entities.GolferProfile.filter({});
    let profile = null;
    if (targetUserId) {
      profile = allProfiles.find((p) => p.created_by_id === targetUserId);
    } else {
      profile = allProfiles.find((p) => p.username === targetUsername);
    }

    if (!profile) {
      return Response.json({ profile: null });
    }

    // Respect privacy: if the target user has privacy=true on their User
    // entity, only return profile to the owner themselves.
    let targetUser = null;
    try {
      const allUsers = await base44.asServiceRole.entities.User.list();
      targetUser = allUsers.find((u) => u.id === profile.created_by_id);
    } catch {}

    const isOwner = profile.created_by_id === user.id;
    if (targetUser?.privacy === true && !isOwner) {
      return Response.json({ profile: null });
    }

    // Resolve avatar URL
    let avatarUrl: string | null = null;
    if (profile.avatar_source === 'upload' && profile.avatar_uri) {
      try {
        const result = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: profile.avatar_uri,
          expires_in: 3600,
        });
        avatarUrl = result.signed_url;
      } catch {}
    } else if (profile.avatar_source === 'default' && profile.avatar_default_id) {
      avatarUrl = getDefaultAvatarUrl(profile.avatar_default_id);
    }

    // Return only public-safe fields
    const publicProfile = sanitizePublicProfile(profile, avatarUrl);
    return Response.json({ profile: publicProfile });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}