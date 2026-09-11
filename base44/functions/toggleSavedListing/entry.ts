import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { restGet, restPost, restDelete } from '../../shared/supabase.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const listingId = body.listingId;
    if (!listingId) return Response.json({ error: 'listingId required' }, { status: 400 });

    const existing = await restGet(
      base44,
      'base44_saved_listings',
      `select=listing_id&base44_user_id=eq.${user.id}&listing_id=eq.${listingId}`
    );
    if (existing.length > 0) {
      await restDelete(base44, 'base44_saved_listings', `base44_user_id=eq.${user.id}&listing_id=eq.${listingId}`);
      return Response.json({ saved: false });
    }
    await restPost(base44, 'base44_saved_listings', { base44_user_id: user.id, listing_id: listingId });
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}