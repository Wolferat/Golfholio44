// ============================================================
// Notifications — shared creation and dedup logic.
//
// Used by runCoverageDiscovery to generate private player
// notifications when coverage reaches a terminal state.
//
// Dedup key: coverage:{area_key}:{terminal_status}
// Result hash: stable hash of sorted verified listing IDs.
//
// A new notification is created only when:
//   - the terminal status changes (e.g. empty → complete), OR
//   - verified listings are added or removed (hash changes)
//
// No notification is created for:
//   - re-runs with the same status and same listing set
//   - reorders or metadata-only updates
//   - polls, retries, or intermediate states
// ============================================================

export function buildCoverageDedupKey(areaKey: string, status: string): string {
  return `coverage:${areaKey}:${status}`;
}

export function buildResultHash(listingIds: string[]): string {
  if (!listingIds || listingIds.length === 0) return 'empty';
  const sorted = [...listingIds].sort().join(':');
  let hash = 5381;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash) + sorted.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function createCoverageNotification(
  base44: any,
  targetUserId: string,
  areaKey: string,
  areaLabel: string,
  city: string | null,
  state: string | null,
  status: string,
  verifiedListingIds: string[]
): Promise<void> {
  if (!targetUserId || targetUserId === 'system') return;

  const dedupKey = buildCoverageDedupKey(areaKey, status);
  const resultHash = buildResultHash(verifiedListingIds);

  // Suppress if a notification with the same dedup_key + result_hash
  // already exists for this player.
  const existing = await base44.asServiceRole.entities.PlayerNotification
    .filter({ target_user_id: targetUserId, dedup_key: dedupKey, result_hash: resultHash })
    .catch(() => []);

  if (existing.length > 0) return;

  const locationLabel = city && state ? `${city}, ${state}` : (areaLabel || 'your area');
  let title: string;
  let body: string;
  let type: string;

  if (status === 'complete') {
    type = 'coverage_complete';
    title = 'Verified golf found';
    body = `We found verified golf near ${locationLabel}.`;
  } else if (status === 'empty') {
    type = 'coverage_empty';
    title = 'No verified golf yet';
    body = `We couldn't find verified golf near ${locationLabel} yet.`;
  } else {
    type = 'coverage_failed';
    title = 'Still working on it';
    body = `We're still working on golf near ${locationLabel}.`;
  }

  const deepLink = city && state
    ? `/?near=${encodeURIComponent(city)},${encodeURIComponent(state)}`
    : '/';

  await base44.asServiceRole.entities.PlayerNotification.create({
    target_user_id: targetUserId,
    type,
    title,
    body,
    area_key: areaKey,
    city: city || null,
    state: state || null,
    deep_link: deepLink,
    read: false,
    dedup_key: dedupKey,
    result_hash: resultHash,
  });
}