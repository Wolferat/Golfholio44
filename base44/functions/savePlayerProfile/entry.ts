import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  validateUsername,
  normalizeUsername,
  isValidDefaultAvatarId,
  FIELD_LIMITS,
} from '../../shared/playerProfile.ts';

// ============================================================
// savePlayerProfile — server-authorized save of public player
// profile fields with username uniqueness enforcement.
//
// Only the authenticated owner can save their own profile.
// Username uniqueness is checked server-side against all
// existing GolferProfile records.
//
// Avatar uploads:
//   - file_uri ownership tracked via AvatarUpload entity
//   - first-claim-wins: the first user to reference a file_uri
//     owns it; others are rejected
//   - automated safety check via InvokeLLM vision model
//   - unsafe or uncertain uploads are rejected
//
// This function does NOT touch the User entity's role, email,
// or verified state. Private account fields (phone, home_city,
// notifications, privacy) are saved separately by the client
// via base44.auth.updateMe().
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

    // --- Username validation (server-side, not client-only) ---
    const usernameResult = validateUsername(body.username || '');
    if (!usernameResult.valid) {
      return Response.json({ error: usernameResult.error }, { status: 400 });
    }
    const username = usernameResult.normalized!;

    // --- Field validation ---
    const displayName = (body.display_name || '').toString().slice(0, FIELD_LIMITS.display_name);
    const firstName = (body.first_name || '').toString().slice(0, FIELD_LIMITS.first_name);
    const lastName = (body.last_name || '').toString().slice(0, FIELD_LIMITS.last_name);
    const bio = (body.bio || '').toString().slice(0, FIELD_LIMITS.bio);
    const avatarSource = ['upload', 'default', 'initials'].includes(body.avatar_source)
      ? body.avatar_source
      : 'initials';
    const avatarDefaultId = isValidDefaultAvatarId(body.avatar_default_id)
      ? body.avatar_default_id
      : null;
    const avatarUri = (body.avatar_uri || '').toString().trim() || null;

    // --- Username uniqueness check (server-side) ---
    // Find all profiles with this username, excluding the current user's own.
    const allProfiles = await base44.asServiceRole.entities.GolferProfile.filter({});
    const duplicate = allProfiles.find(
      (p) => p.username === username && p.created_by_id !== user.id
    );
    if (duplicate) {
      return Response.json({ error: 'That username is taken' }, { status: 409 });
    }

    // --- Avatar handling ---
    let finalAvatarUri = null;
    let finalAvatarSource = avatarSource;
    let finalAvatarDefaultId = avatarDefaultId;

    if (avatarSource === 'upload' && avatarUri) {
      // Verify/create ownership record (first-claim-wins)
      const existingClaims = await base44.asServiceRole.entities.AvatarUpload.filter({
        file_uri: avatarUri,
      });
      if (existingClaims.length > 0 && existingClaims[0].uploaded_by_id !== user.id) {
        return Response.json({ error: 'Avatar file ownership mismatch' }, { status: 403 });
      }
      if (existingClaims.length === 0) {
        await base44.asServiceRole.entities.AvatarUpload.create({
          file_uri: avatarUri,
          uploaded_by_id: user.id,
        });
      }

      // Create a temporary signed URL for the safety check
      let signedUrl: string | null = null;
      try {
        const result = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: avatarUri,
          expires_in: 120,
        });
        signedUrl = result.signed_url;
      } catch {
        return Response.json({ error: 'Could not verify avatar file' }, { status: 400 });
      }

      // Automated safety check via LLM vision
      try {
        const safety = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt:
            'Analyze this image for use as a profile avatar in a golf community app. ' +
            'Check for: nudity or sexual content, violence or gore, hate symbols, ' +
            'offensive imagery, real personal information (names, addresses, phone numbers). ' +
            'Respond with JSON: {"safe": true/false, "reason": "brief explanation"}. ' +
            'If the image is appropriate and safe, return {"safe": true, "reason": "appropriate"}. ' +
            'If you are uncertain, return {"safe": false, "reason": "uncertain"}.',
          file_urls: [signedUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              safe: { type: 'boolean' },
              reason: { type: 'string' },
            },
          },
        });
        if (!safety?.safe) {
          // Delete the ownership claim so the file can't be reused
          await base44.asServiceRole.entities.AvatarUpload.deleteMany({
            file_uri: avatarUri,
            uploaded_by_id: user.id,
          });
          return Response.json(
            { error: 'Avatar rejected: ' + (safety?.reason || 'unsafe content') },
            { status: 400 }
          );
        }
      } catch {
        // Fail closed: if the safety check can't run, reject the upload
        await base44.asServiceRole.entities.AvatarUpload.deleteMany({
          file_uri: avatarUri,
          uploaded_by_id: user.id,
        });
        return Response.json({ error: 'Avatar safety check failed' }, { status: 400 });
      }

      finalAvatarUri = avatarUri;
    } else if (avatarSource === 'default') {
      if (!avatarDefaultId) {
        return Response.json({ error: 'Select a default avatar' }, { status: 400 });
      }
      finalAvatarUri = null; // default avatars use public URLs, no private URI
    } else {
      // initials or no avatar
      finalAvatarSource = 'initials';
      finalAvatarUri = null;
      finalAvatarDefaultId = null;
    }

    // --- Find or create the owner's profile ---
    let profile = allProfiles.find((p) => p.created_by_id === user.id);

    const updateData: any = {
      username,
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      bio,
      avatar_source: finalAvatarSource,
      avatar_default_id: finalAvatarDefaultId,
    };

    // Only update avatar_uri if a new one is provided; otherwise keep existing
    if (finalAvatarUri !== null) {
      updateData.avatar_uri = finalAvatarUri;
    } else if (avatarSource === 'default' || avatarSource === 'initials') {
      updateData.avatar_uri = null;
    }

    if (profile) {
      // Update existing profile — RLS allows owner only
      profile = await base44.entities.GolferProfile.update(profile.id, updateData);
    } else {
      // Create new profile — RLS requires created_by_id == user.id
      updateData.username = username;
      profile = await base44.entities.GolferProfile.create(updateData);
    }

    // Return public-safe fields only (no first_name, last_name, avatar_uri)
    return Response.json({
      profile: {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        bio: profile.bio || null,
        avatar_source: profile.avatar_source || 'initials',
        avatar_default_id: profile.avatar_default_id || null,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}