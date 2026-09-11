import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { restGet } from '../../shared/supabase.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await restGet(base44, 'base44_saved_listings', `select=listing_id&base44_user_id=eq.${user.id}`);
    const savedIds = rows.map((r) => r.listing_id);
    return Response.json({ savedIds });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}