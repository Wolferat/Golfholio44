import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { haversineMi } from '../../shared/googlePlaces.ts';

const SHERMAN = { lat: 33.6357, lng: -96.6086 };
const RADIUS_MI = 15;
const EVENT_TYPES = new Set(['tournament', 'charity_event', 'corporate_event', 'league']);

const NON_GOLF_PATTERNS = [
  'church', 'cathedral', 'ministry', 'temple', 'mosque', 'synagogue',
  'school', 'isd', 'elementary', 'middle school', 'high school', 'university', 'college',
  'hospital', 'medical', 'clinic', 'dental', 'pharmacy',
  'cemetery', 'funeral', 'mortuary',
  'restaurant', 'cafe', 'coffee', 'pizza', 'taco', 'bbq',
  'hotel', 'motel', 'gas station', 'grocery', 'supermarket', 'walmart', 'target',
  'home depot', 'lowes', 'apartment', 'real estate', 'realtor',
  'auto', 'car wash', 'tire', 'storage', 'warehouse',
  'county', 'clerk', 'city hall', 'municipal', 'post office', 'library', 'police', 'fire dept', 'fire department', 'sheriff',
];

const GOLF_KEYWORDS = ['golf', 'driving range', 'putt', 'mini golf', 'country club', 'links', 'fairway', 'simulator'];

const VALID_TYPES = new Set(['course', 'simulator', 'training', 'tournament', 'charity_event', 'corporate_event', 'league', 'golf_related_venue']);

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function computeDistance(r) {
  if (r.latitude == null || r.longitude == null) return null;
  return Math.round(haversineMi(SHERMAN.lat, SHERMAN.lng, r.latitude, r.longitude) * 10) / 10;
}

// A plain website is NOT a credible verified source.
// Verified source = verification_tier 1-4 AND a recorded source_url.
function hasVerifiedSource(r) {
  const tier = r.verification_tier;
  return tier != null && tier >= 1 && tier <= 4 && !!r.source_url;
}

function hasAnySourceCandidate(r) {
  return !!r.source_url || !!r.official_website || !!r.website;
}

function hasUnverifiedPhotos(r) {
  return Array.isArray(r.photos) && r.photos.length > 0 && !r.photo_verified;
}

function isNonGolfName(name) {
  const lower = (name || '').toLowerCase();
  const hasGolfKw = GOLF_KEYWORDS.some((kw) => lower.includes(kw));
  const hasNonGolfKw = NON_GOLF_PATTERNS.some((p) => lower.includes(p));
  return hasNonGolfKw && !hasGolfKw;
}

function recommendAction(reasons) {
  if (reasons.includes('non-golf name pattern')) return 'Reject';
  if (reasons.includes('expired event')) return 'Expire/archive';
  if (reasons.includes('invalid type')) return 'Flag for human review';
  if (reasons.includes('duplicate')) return 'Duplicate review';
  if (reasons.includes('out of radius')) return 'Keep hidden';
  if (reasons.includes('no source candidate')) return 'Find source or reject';
  if (reasons.includes('website unverified')) return 'Verify website → promote tier';
  if (reasons.includes('missing verification metadata')) return 'Promote to tier 1-4 + add source_url';
  if (reasons.includes('unverified photos')) return 'Suppress photo / re-verify photo';
  return 'Keep approved';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const raw = await base44.asServiceRole.entities.Listing.filter({});

    // Deduplicate by Listing ID — the table must have exactly one row per unique ID.
    const seenIds = new Set();
    const records = [];
    for (const r of raw) {
      if (!r.id || seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      records.push(r);
    }
    const totalUniqueListings = records.length;
    const now = new Date();

    // Every category tracks distinct IDs via Sets so counts can never exceed totalUniqueListings.
    const ids = {
      nonGolf: new Set(),
      outOfRadius: new Set(),
      categoryMismatches: new Set(),
      duplicates: new Set(),
      missingVerificationMetadata: new Set(),
      unverifiedPhotos: new Set(),
      expiredEvents: new Set(),
      legacyTypes: new Set(),
      claimedStatus: new Set(),
    };

    // Mutually exclusive source-verification breakdown — must sum to totalUniqueListings.
    const sourceVerification = {
      verifiedSource: new Set(),        // tier 1-4 + source_url
      candidateUnverified: new Set(),   // has website/official_website/source_url but not verified
      noSourceCandidate: new Set(),     // no website, official_website, or source_url at all
    };

    const audit = {
      nonGolf: [],
      outOfRadius: [],
      categoryMismatches: [],
      duplicates: [],
      missingVerificationMetadata: [],
      noSourceCandidate: [],
      websiteUnverified: [],
      unverifiedPhotos: [],
      expiredEvents: [],
      legacyTypes: [],
      claimedStatus: [],
    };

    const table = [];
    const seenNames = new Map();
    const seenPlaceIds = new Map();

    for (const r of records) {
      const name = (r.name || '').toLowerCase();
      const distance = computeDistance(r);
      const reasons = [];

      // Mutually exclusive source-verification bucket
      if (hasVerifiedSource(r)) {
        sourceVerification.verifiedSource.add(r.id);
      } else if (hasAnySourceCandidate(r)) {
        sourceVerification.candidateUnverified.add(r.id);
      } else {
        sourceVerification.noSourceCandidate.add(r.id);
      }

      // 1. Probable non-golf
      const hasGolfKw = GOLF_KEYWORDS.some((kw) => name.includes(kw));
      const hasNonGolfKw = NON_GOLF_PATTERNS.some((p) => name.includes(p));
      if (hasNonGolfKw && !hasGolfKw) {
        reasons.push('non-golf name pattern');
        ids.nonGolf.add(r.id);
        audit.nonGolf.push({ id: r.id, name: r.name, type: r.type, status: r.status, reason: 'non-golf name pattern' });
      }

      // 2. Out of radius
      if (distance != null && distance > RADIUS_MI) {
        reasons.push('out of radius');
        ids.outOfRadius.add(r.id);
        audit.outOfRadius.push({ id: r.id, name: r.name, type: r.type, distance });
      }

      // 3. Category mismatch
      if (!VALID_TYPES.has(r.type)) {
        reasons.push('invalid type');
        ids.categoryMismatches.add(r.id);
        audit.categoryMismatches.push({ id: r.id, name: r.name, type: r.type, reason: 'invalid type' });
      }

      // 3b. Legacy type
      if (r.type === 'lesson') {
        reasons.push('legacy type');
        ids.legacyTypes.add(r.id);
        audit.legacyTypes.push({ id: r.id, name: r.name, type: r.type, suggestedType: 'training' });
      }

      // 4. Duplicates — track by name and place_id
      const norm = normalizeName(r.name);
      if (norm) {
        if (!seenNames.has(norm)) seenNames.set(norm, []);
        seenNames.get(norm).push(r);
      }
      if (r.place_id) {
        if (!seenPlaceIds.has(r.place_id)) seenPlaceIds.set(r.place_id, []);
        seenPlaceIds.get(r.place_id).push(r);
      }

      // 5. Missing required public verification metadata (no tier 1-4 and/or no source_url)
      const tier = r.verification_tier;
      const hasCredibleTier = tier != null && tier >= 1 && tier <= 4;
      const hasSourceUrl = !!r.source_url;
      if (!hasCredibleTier || !hasSourceUrl) {
        reasons.push('missing verification metadata');
        ids.missingVerificationMetadata.add(r.id);
        audit.missingVerificationMetadata.push({
          id: r.id, name: r.name, type: r.type, status: r.status,
          verification_tier: tier ?? null,
          has_source_url: hasSourceUrl,
        });
      }

      // 5b. No website or source candidate at all (distinct from "missing metadata")
      if (!hasAnySourceCandidate(r)) {
        reasons.push('no source candidate');
        audit.noSourceCandidate.push({ id: r.id, name: r.name, type: r.type, status: r.status });
      }

      // 5c. Has a website but remains unverified (no tier 1-4)
      if ((r.website || r.official_website) && !hasCredibleTier) {
        reasons.push('website unverified');
        audit.websiteUnverified.push({ id: r.id, name: r.name, type: r.type, status: r.status, website: r.website || r.official_website });
      }

      // 6. Unverified photos
      if (hasUnverifiedPhotos(r)) {
        reasons.push('unverified photos');
        ids.unverifiedPhotos.add(r.id);
        audit.unverifiedPhotos.push({ id: r.id, name: r.name, photoCount: r.photos.length });
      }

      // 7. Expired events still public
      if (EVENT_TYPES.has(r.type) && r.ends_at && new Date(r.ends_at) < now && r.status === 'approved') {
        reasons.push('expired event');
        ids.expiredEvents.add(r.id);
        audit.expiredEvents.push({ id: r.id, name: r.name, type: r.type, endsAt: r.ends_at });
      }

      // 8. Records using claimed as a status (should be migrated to claim_status)
      if (r.status === 'claimed') {
        reasons.push('status: claimed (should be approved + claim_status)');
        ids.claimedStatus.add(r.id);
        audit.claimedStatus.push({ id: r.id, name: r.name, type: r.type, status: r.status, claimed_by: r.claimed_by });
      }

      // Build per-record row (one per unique ID)
      table.push({
        id: r.id,
        name: r.name,
        type: r.type,
        city: r.city || '',
        distance,
        status: r.status,
        claim_status: r.claim_status || 'unclaimed',
        source_url: r.source_url || '',
        has_website: !!(r.website || r.official_website),
        verification_tier: r.verification_tier ?? null,
        golf_verified: r.golf_verified || false,
        photo_count: Array.isArray(r.photos) ? r.photos.length : 0,
        photo_verified: r.photo_verified || false,
        audit_reasons: reasons,
        recommended_action: recommendAction(reasons),
      });
    }

    // Process duplicate groups — mark records in duplicate groups
    for (const [norm, dups] of seenNames) {
      if (dups.length > 1) {
        audit.duplicates.push({
          key: norm,
          reason: 'same normalized name',
          records: dups.map((r) => ({ id: r.id, name: r.name, type: r.type, status: r.status, city: r.city })),
        });
        dups.forEach((r) => ids.duplicates.add(r.id));
      }
    }
    for (const [placeId, dups] of seenPlaceIds) {
      if (dups.length > 1) {
        audit.duplicates.push({
          key: placeId,
          reason: 'same place_id',
          records: dups.map((r) => ({ id: r.id, name: r.name, type: r.type, status: r.status })),
        });
        dups.forEach((r) => ids.duplicates.add(r.id));
      }
    }
    // Add duplicate reason to affected table rows
    for (const row of table) {
      if (ids.duplicates.has(row.id) && !row.audit_reasons.includes('duplicate')) {
        row.audit_reasons.push('duplicate');
        row.recommended_action = recommendAction(row.audit_reasons);
      }
    }

    const sv = sourceVerification;
    const svTotal = sv.verifiedSource.size + sv.candidateUnverified.size + sv.noSourceCandidate.size;

    const summary = {
      totalUniqueListings,
      sourceVerification: {
        verifiedSource: sv.verifiedSource.size,
        candidateUnverified: sv.candidateUnverified.size,
        noSourceCandidate: sv.noSourceCandidate.size,
        sum: svTotal,
        sumsToTotal: svTotal === totalUniqueListings,
      },
      nonGolf: ids.nonGolf.size,
      outOfRadius: ids.outOfRadius.size,
      categoryMismatches: ids.categoryMismatches.size,
      duplicates: ids.duplicates.size,
      missingVerificationMetadata: ids.missingVerificationMetadata.size,
      noSourceCandidate: sv.noSourceCandidate.size,
      websiteUnverified: sv.candidateUnverified.size,
      unverifiedPhotos: ids.unverifiedPhotos.size,
      expiredEvents: ids.expiredEvents.size,
      legacyTypes: ids.legacyTypes.size,
      claimedStatus: ids.claimedStatus.size,
      overlapNote: 'Categories (nonGolf, outOfRadius, duplicates, missingVerificationMetadata, unverifiedPhotos, expiredEvents, etc.) are NOT mutually exclusive — a single listing can appear in multiple categories. Only sourceVerification {verifiedSource, candidateUnverified, noSourceCandidate} is mutually exclusive and sums to totalUniqueListings. All counts are distinct Listing IDs.',
    };

    return Response.json({ summary, audit, table });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}