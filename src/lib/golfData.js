import { base44 } from '@/api/base44Client';

// ============================================================
// Explore & Saved — live Supabase data via backend functions
// ============================================================
export async function getListings(category, loc = {}) {
  const res = await base44.functions.invoke('getGolfListings', { category, ...loc });
  return res.data.items;
}

export async function searchListings(query, category, loc = {}) {
  const res = await base44.functions.invoke('getGolfListings', { query, category, ...loc });
  return res.data.items;
}

export async function getSavedIds() {
  const res = await base44.functions.invoke('getSavedListings', {});
  return new Set(res.data.savedIds);
}

export async function getFavorites() {
  const [allRes, savedRes] = await Promise.all([
    base44.functions.invoke('getGolfListings', { category: 'all' }),
    base44.functions.invoke('getSavedListings', {}),
  ]);
  const savedIds = new Set(savedRes.data.savedIds);
  return allRes.data.items.filter((i) => savedIds.has(i.id));
}

export async function toggleFavorite(id) {
  const res = await base44.functions.invoke('toggleSavedListing', { listingId: id });
  return res.data.saved;
}

export async function getListingById(id, loc = {}) {
  const res = await base44.functions.invoke('getListingDetails', { id, ...loc });
  return res.data.item || null;
}

export async function getTournaments(loc = {}) {
  const res = await base44.functions.invoke('getTournaments', loc);
  return res.data.items;
}

export async function searchTournaments(query, loc = {}) {
  const res = await base44.functions.invoke('getTournaments', { query, ...loc });
  return res.data.items;
}

export async function getLiveTournaments(loc = {}) {
  const res = await base44.functions.invoke('getTournaments', loc);
  const now = new Date();
  return (res.data.items || [])
    .filter((t) => t.startsAt)
    .map((t) => ({
      ...t,
      live: t.live || (new Date(t.startsAt) <= now && (!t.endsAt || new Date(t.endsAt) >= now)),
    }))
    .sort((a, b) => (a.live === b.live ? new Date(a.startsAt) - new Date(b.startsAt) : a.live ? -1 : 1));
}

export async function getTournament(id, loc = {}) {
  const res = await base44.functions.invoke('getListingDetails', { id, ...loc });
  const item = res.data.item;
  if (!item) return null;
  const eventTypes = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);
  return eventTypes.has(item.type) ? item : null;
}

export async function matchContacts(phones) {
  const res = await base44.functions.invoke('matchContacts', { phones });
  return res.data.matches || [];
}

// ============================================================
// Admin — listing review & audit (real backend functions)
// ============================================================
export async function getPendingListings(status = 'pending') {
  const res = await base44.functions.invoke('getAdminListings', { status });
  return res.data.items || [];
}

export async function reviewListingAction(listingId, action, notes) {
  const res = await base44.functions.invoke('reviewListing', { listingId, action, notes });
  return res.data;
}

export async function getAuditReport() {
  const res = await base44.functions.invoke('auditListings', {});
  return res.data;
}

export async function getAdminMetrics() {
  const res = await base44.functions.invoke('getAdminMetrics', {});
  return res.data;
}

export async function moderateReview(reviewId, action, reason) {
  const res = await base44.functions.invoke('moderateReview', { review_id: reviewId, action, reason });
  return res.data;
}

export async function getHandicapEstimate() {
  const res = await base44.functions.invoke('getHandicapEstimate', {});
  return res.data;
}

export async function resolveLocation(params) {
  const res = await base44.functions.invoke('resolveLocation', params);
  return res.data;
}

// ============================================================
// Coverage — server-controlled, deduplicated area coverage
// ============================================================
export async function requestCoverage(loc = {}) {
  const res = await base44.functions.invoke('requestCoverage', loc);
  return res.data;
}

export async function getCoverageStatus(loc = {}) {
  const res = await base44.functions.invoke('getCoverageStatus', loc);
  return res.data;
}

// ============================================================
// Player Profile — public profile management
// ============================================================
export async function getMyProfileEntity() {
  const profiles = await base44.entities.GolferProfile.filter({});
  return profiles[0] || null;
}

export async function getPublicProfile(params) {
  const res = await base44.functions.invoke('getPlayerProfile', params);
  return res.data.profile;
}

export async function savePlayerProfile(data) {
  const res = await base44.functions.invoke('savePlayerProfile', data);
  return res.data;
}

// ============================================================
// My Game & Crew — mock data (wired to Supabase in a follow-up)
// ============================================================
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const state = {
  rounds: [
    { id: 'r1', date: '2026-09-06', holes: 18, score: 92, notes: 'Solid round, drove it well.' },
    { id: 'r2', date: '2026-08-28', holes: 9, score: 41, notes: 'Quick nine after work.' },
  ],
  connections: [
    { id: 'u1', username: 'mfairway', name: 'Marcus Fairway', status: 'connected' },
    { id: 'u2', username: 'tee_time_tina', name: 'Tina Park', status: 'connected' },
  ],
  requests: [
    { id: 'u3', username: 'bogey_bob', name: 'Bob Reyes', status: 'incoming' },
  ],
  blocked: new Set(),
  pendingPhotos: [
    { id: 'p1', listing: 'Pine Crest Golf Links', submittedBy: 'mfairway', submittedAt: '2026-09-10', status: 'pending' },
    { id: 'p2', listing: 'SwingLab Studio', submittedBy: 'tee_time_tina', submittedAt: '2026-09-09', status: 'pending' },
  ],
  flaggedListings: [
    { id: 'f1', name: 'Old Oak Pitch & Putt', reason: 'Duplicate listing', status: 'flagged' },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 9);

export async function getRounds() {
  await delay();
  return [...state.rounds].sort((a, b) => (a.date < b.date ? 1 : -1));
}
export async function addRound({ holes, score, date, notes }) {
  await delay();
  const round = { id: uid(), date, holes: Number(holes), score: Number(score), notes };
  state.rounds.push(round);
  return round;
}
export async function getRoundStats() {
  const rounds = state.rounds;
  if (!rounds.length) return { count: 0, avg: null, best: null };
  const avg = Math.round(rounds.reduce((s, r) => s + r.score, 0) / rounds.length);
  const best = Math.min(...rounds.map((r) => r.score));
  return { count: rounds.length, avg, best };
}
export async function getCrew() {
  await delay();
  return state.connections.filter((c) => !state.blocked.has(c.id));
}
export async function getRequests() {
  await delay();
  return state.requests;
}
export async function searchUser(username) {
  await delay();
  const exact = username.trim().toLowerCase();
  if (!exact) return null;
  return [
    { id: 'u9', username: 'links_luke', name: 'Luke Andersen' },
    { id: 'u10', username: 'birdie_kim', name: 'Kim Watanabe' },
  ].find((u) => u.username.toLowerCase() === exact) || null;
}
export async function sendRequest(user) {
  await delay();
  state.requests.push({ id: user.id, username: user.username, name: user.name, status: 'outgoing' });
  return true;
}
export async function respondRequest(id, action) {
  await delay();
  const req = state.requests.find((r) => r.id === id);
  if (!req) return false;
  state.requests = state.requests.filter((r) => r.id !== id);
  if (action === 'accept') state.connections.push({ ...req, status: 'connected' });
  return true;
}
export async function blockUser(id) {
  state.blocked.add(id);
  state.connections = state.connections.filter((c) => c.id !== id);
  state.requests = state.requests.filter((r) => r.id !== id);
  return true;
}
export async function getPendingPhotos() {
  await delay();
  return state.pendingPhotos.filter((p) => p.status === 'pending');
}
export async function getFlaggedListings() {
  await delay();
  return state.flaggedListings;
}
export async function reviewPhoto(id, action) {
  await delay();
  const p = state.pendingPhotos.find((x) => x.id === id);
  if (p) p.status = action;
  return true;
}