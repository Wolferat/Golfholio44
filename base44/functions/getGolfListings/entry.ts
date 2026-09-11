import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { restGet } from '../../shared/supabase.js';

const KIND_FILTER = {
  course: 'course',
  simulator: 'simulator',
  tournament: 'charity',
  lesson: 'training',
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const category = body.category || 'all';
    const query = (body.query || '').trim();

    let qs = 'select=id,title,kind,city,starts_at,price_note,description,venue_name,official_website,phone,address,latitude,longitude&status=eq.approved&order=created_at.desc&limit=60';
    const kind = KIND_FILTER[category];
    if (kind) qs += `&kind=eq.${kind}`;

    let rows = await restGet(base44, 'listings', qs);

    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.venue_name || '').toLowerCase().includes(q)
      );
    }

    const items = rows.map((r) => ({
      id: r.id,
      type: r.kind,
      name: r.title,
      location: [r.venue_name, r.city].filter(Boolean).join(' · '),
      city: r.city,
      venue: r.venue_name,
      date: r.starts_at ? String(r.starts_at).slice(0, 10) : null,
      price: r.price_note,
      blurb: r.description,
      website: r.official_website,
      phone: r.phone,
      address: r.address,
    }));

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}