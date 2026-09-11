// Mock data layer for Golfolio.
// Structured to mirror Supabase tables (courses, simulators, events, favorites,
// rounds, crew_connections, crew_requests, pending_photos). These async
// functions will be replaced by backend-function calls that hit Supabase once
// the connector is authorized and the schema is inspected.

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

const COURSES = [
  { id: 'c1', type: 'course', name: 'Pine Crest Golf Links', location: 'Monterey, CA', distance: 4.2, rating: 4.7, price: '$$$', holes: 18, blurb: 'Cliffside championship links with ocean views on every hole.' },
  { id: 'c2', type: 'course', name: 'Oakmont Valley', location: 'Austin, TX', distance: 12.8, rating: 4.4, price: '$$', holes: 18, blurb: 'Tree-lined fairways and fast, rolling greens.' },
  { id: 'c3', type: 'course', name: 'Desert Mirage CC', location: 'Scottsdale, AZ', distance: 22.1, rating: 4.6, price: '$$$', holes: 18, blurb: 'Desert target golf with mountain backdrops.' },
  { id: 'c4', type: 'course', name: 'Harbor Pines Par-3', location: 'Portland, OR', distance: 3.1, rating: 4.2, price: '$', holes: 9, blurb: 'Quick 9-hole loop perfect for beginners.' },
];

const SIMULATORS = [
  { id: 's1', type: 'simulator', name: 'SwingLab Studio', location: 'Downtown, SF', distance: 1.8, rating: 4.8, price: '$$', blurb: 'TrackMan bays with 80+ virtual courses and league nights.' },
  { id: 's2', type: 'simulator', name: 'GreenBox Indoor', location: 'Brooklyn, NY', distance: 6.4, rating: 4.5, price: '$$', blurb: 'Year-round indoor bay rental with food and drink service.' },
];

const EVENTS = [
  { id: 'e1', type: 'event', name: 'Saturday Scramble', location: 'Oakmont Valley, TX', date: '2026-09-19', rating: 4.3, price: '$$', blurb: '4-person scramble, shotgun 8am. Entry includes lunch.' },
  { id: 'e2', type: 'event', name: 'Twilight 9 & Dine', location: 'Harbor Pines, OR', date: '2026-09-25', rating: 4.6, price: '$', blurb: '9 holes followed by a fireside dinner on the patio.' },
  { id: 'e3', type: 'event', name: 'Sim League Night', location: 'SwingLab, SF', date: '2026-09-30', rating: 4.7, price: '$', blurb: 'Weekly indoor league — all handicaps welcome.' },
];

const ALL = [...COURSES, ...SIMULATORS, ...EVENTS];

// In-session mock state (mirrors per-user Supabase tables)
const state = {
  favorites: new Set(['c1']),
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

export async function getListings(category) {
  await delay();
  if (!category || category === 'all') return ALL;
  return ALL.filter((x) => x.type === category);
}

export async function searchListings(query, category) {
  await delay(250);
  const q = query.trim().toLowerCase();
  return ALL.filter((x) => {
    const matchCat = !category || category === 'all' || x.type === category;
    const matchQ = !q || x.name.toLowerCase().includes(q) || x.location.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}

export async function getFavorites() {
  await delay(200);
  return ALL.filter((x) => state.favorites.has(x.id));
}

export async function isFavorite(id) {
  return state.favorites.has(id);
}

export async function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  return state.favorites.has(id);
}

export async function getRounds() {
  await delay(200);
  return [...state.rounds].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function addRound({ holes, score, date, notes }) {
  await delay(200);
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
  await delay(200);
  return state.connections.filter((c) => !state.blocked.has(c.id));
}

export async function getRequests() {
  await delay(200);
  return state.requests;
}

export async function searchUser(username) {
  await delay(300);
  const exact = username.trim().toLowerCase();
  if (!exact) return null;
  const found = [
    { id: 'u9', username: 'links_luke', name: 'Luke Andersen' },
    { id: 'u10', username: 'birdie_kim', name: 'Kim Watanabe' },
  ].find((u) => u.username.toLowerCase() === exact);
  return found || null;
}

export async function sendRequest(user) {
  await delay(200);
  state.requests.push({ id: user.id, username: user.username, name: user.name, status: 'outgoing' });
  return true;
}

export async function respondRequest(id, action) {
  await delay(200);
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
  await delay(200);
  return state.pendingPhotos.filter((p) => p.status === 'pending');
}

export async function getFlaggedListings() {
  await delay(200);
  return state.flaggedListings;
}

export async function reviewPhoto(id, action) {
  await delay(200);
  const p = state.pendingPhotos.find((x) => x.id === id);
  if (p) p.status = action; // 'approved' | 'rejected'
  return true;
}