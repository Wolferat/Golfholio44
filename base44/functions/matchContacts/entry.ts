import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { restGet } from '../../shared/supabase.js';

function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, '');
  if (!s) return null;
  if (!s.startsWith('+')) {
    if (s.length === 10) s = '+1' + s;
    else if (s.length === 11 && s.startsWith('1')) s = '+' + s;
    else s = '+' + s;
  }
  return s;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const phones = Array.isArray(body.phones) ? body.phones : [];
    const normalized = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)));
    if (!normalized.length) return Response.json({ matches: [] });

    const qs = 'select=id,username,first_name,last_name,avatar,city,phone&phone=not.is.null&limit=500';
    const rows = await restGet(base44, 'profiles', qs);

    const byPhone = new Map();
    rows.forEach((r) => { const n = normalizePhone(r.phone); if (n) byPhone.set(n, r); });

    const matches = normalized.map((p) => byPhone.get(p)).filter(Boolean).map((r) => ({
      id: r.id,
      username: r.username,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username,
      avatar: r.avatar,
      city: r.city,
    }));
    return Response.json({ matches });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}