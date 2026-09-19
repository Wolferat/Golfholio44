// ============================================================
// Player Profile — shared validation, sanitization, and
// default-avatar constants.
//
// Server-side only. Imported by savePlayerProfile,
// getPlayerProfile, and runAccountTests.
// ============================================================

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help',
  'golfholio', 'golfolio', 'official', 'moderator', 'mod',
  'staff', 'team', 'account', 'settings', 'profile', 'user',
  'test', 'null', 'undefined', 'none', 'anonymous', 'guest',
  'api', 'login', 'register', 'signup', 'logout', 'auth',
  'golf', 'golfer', 'player', 'course', 'club', 'pro', 'proshop',
  'howling', 'solutions', 'owner', 'superuser', 'superadmin',
]);

export function normalizeUsername(raw: string): string {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function validateUsername(raw: string): { valid: boolean; error?: string; normalized?: string } {
  const username = normalizeUsername(raw);
  if (!username) return { valid: false, error: 'Username is required' };
  if (username.length < 3) return { valid: false, error: 'Username must be at least 3 characters' };
  if (username.length > 20) return { valid: false, error: 'Username must be 20 characters or fewer' };
  if (!/^[a-z0-9_]+$/.test(username)) return { valid: false, error: 'Username can only contain lowercase letters, numbers, and underscores' };
  if (!/^[a-z]/.test(username)) return { valid: false, error: 'Username must start with a letter' };
  if (/_{2,}/.test(username)) return { valid: false, error: 'Username cannot have consecutive underscores' };
  if (username.endsWith('_')) return { valid: false, error: 'Username cannot end with an underscore' };
  if (RESERVED_USERNAMES.has(username)) return { valid: false, error: 'This username is reserved' };
  return { valid: true, normalized: username };
}

// Strip private fields before returning a profile to another player.
// Exposed: username, display_name, bio, avatar_url, avatar_source.
// Never exposed: first_name, last_name, avatar_uri, created_by_id, etc.
export function sanitizePublicProfile(profile: any, avatarUrl: string | null = null): any {
  if (!profile) return null;
  return {
    username: profile.username || null,
    display_name: profile.display_name || null,
    bio: profile.bio || null,
    avatar_url: avatarUrl,
    avatar_source: profile.avatar_source || 'initials',
  };
}

export const DEFAULT_AVATARS: { id: string; url: string; label: string }[] = [
  { id: 'golf_ball', url: 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/bbb5f3107_generated_image.png', label: 'Golf Ball' },
  { id: 'flag_cup', url: 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/78e8d4cbc_generated_image.png', label: 'Flag & Cup' },
  { id: 'golf_club', url: 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/f9719b12b_generated_image.png', label: 'Golf Club' },
  { id: 'golf_cart', url: 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/0fe18bda9_generated_image.png', label: 'Golf Cart' },
];

export function getDefaultAvatarUrl(id: string): string | null {
  const found = DEFAULT_AVATARS.find((a) => a.id === id);
  return found ? found.url : null;
}

export function isValidDefaultAvatarId(id: string): boolean {
  return DEFAULT_AVATARS.some((a) => a.id === id);
}

// Field length limits enforced server-side.
export const FIELD_LIMITS = {
  display_name: 60,
  first_name: 40,
  last_name: 40,
  bio: 500,
};