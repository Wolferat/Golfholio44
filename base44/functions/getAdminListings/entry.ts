import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body.status || 'pending';

    const records = await base44.asServiceRole.entities.Listing.filter({ status });

    const items = records.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      venue_name: r.venue_name,
      city: r.city,
      state: r.state,
      address: r.address,
      phone: r.phone,
      website: r.official_website || r.website,
      status: r.status,
      source_url: r.source_url,
      source_type: r.source_type,
      verification_tier: r.verification_tier,
      verification_notes: r.verification_notes,
      official_website: r.official_website,
      official_registration_url: r.official_registration_url,
      is_professional_tournament: r.is_professional_tournament,
      rating: r.rating ?? null,
      photos: Array.isArray(r.photos) ? r.photos : [],
      photo_verified: r.photo_verified,
      starts_at: r.starts_at || null,
      ends_at: r.ends_at || null,
      created_date: r.created_date,
    }));

    return Response.json({ items, count: items.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}