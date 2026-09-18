import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// ============================================================
// Admin Metrics — private, server-authorized observability
//
// Returns aggregate metrics for the admin dashboard:
//   - Photo workflow status counts (accepted, rejected,
//     retrying, failed)
//   - Recent photo rejections with source/attribution and
//     machine-readable rejection reason
//   - Review safety flags (pending, rejected counts)
//   - Listing inaccuracy reports (pending count + sample)
//
// Admin-only. No normal-player access.
// ============================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Photo metrics
    const allPhotos = await base44.asServiceRole.entities.OfficialPhoto
      .list('-created_date', 200)
      .catch(() => []);

    const photoCounts = { accepted: 0, rejected: 0, retrying: 0, failed: 0 };
    for (const p of allPhotos) {
      if (photoCounts[p.validation_status] != null) {
        photoCounts[p.validation_status]++;
      }
    }

    // Recent rejected photos with source/attribution and reason
    const rejectedPhotos = allPhotos
      .filter((p) => p.validation_status === 'rejected' && p.photo_url)
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        listing_name: p.listing_name || 'Unknown',
        photo_url: p.photo_url,
        source_url: p.source_url || '',
        attribution: p.attribution || '',
        validation_result: p.validation_result || '',
        validation_time: p.validation_time,
      }));

    // Review metrics
    const allReviews = await base44.asServiceRole.entities.Review
      .list('-created_date', 200)
      .catch(() => []);

    const reviewCounts = { approved: 0, pending: 0, rejected: 0 };
    for (const r of allReviews) {
      if (reviewCounts[r.status] != null) {
        reviewCounts[r.status]++;
      }
    }

    // Pending/rejected reviews with safety flags
    const flaggedReviews = allReviews
      .filter((r) => r.status === 'pending' || r.status === 'rejected')
      .slice(0, 15)
      .map((r) => ({
        id: r.id,
        listing_name: r.listing_name || 'Unknown',
        rating: r.rating,
        status: r.status,
        moderation_note: r.moderation_note || '',
        created_date: r.created_date,
      }));

    // Listing inaccuracy reports (pending)
    const pendingReports = await base44.asServiceRole.entities.Report
      .filter({ status: 'pending' }, '-created_date', 50)
      .catch(() => []);

    const reportSample = pendingReports.slice(0, 15).map((r) => ({
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      details: r.details || '',
      created_date: r.created_date,
    }));

    return Response.json({
      photos: {
        counts: photoCounts,
        total: allPhotos.length,
        recent_rejections: rejectedPhotos,
      },
      reviews: {
        counts: reviewCounts,
        total: allReviews.length,
        flagged: flaggedReviews,
      },
      reports: {
        pending_count: pendingReports.length,
        sample: reportSample,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}