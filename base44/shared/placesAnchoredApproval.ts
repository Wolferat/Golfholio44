// ============================================================
// Places-anchored approval — for a real golf venue that has NO
// official website (or whose site cannot be read at all).
//
// The official-source gate cannot verify such a venue, so it stays
// rejected. An admin may publish it explicitly, and this module is
// the ONLY way that happens. It is deliberately strict and never
// skips the safety checks that do not need a website:
//   - the name must carry a real golf signal (not a hotel/retail)
//   - a Google place_id must exist (durable venue identity)
//   - a usable street address + coordinates are required
//   - the venue must be inside the import radius
//   - it must not already be listed
//
// The published record is marked as a SEPARATE, weaker provenance:
// source_type 'google_places', tier 1, the admin as verifier, and the
// Google place-id URL as its source. The public policy recognises
// exactly that shape and nothing broader.
// ============================================================

import { isGolfRelated } from './googlePlaces.ts';
import { entityTypeForCategory, findExistingDuplicate } from './officialSourceVerification.ts';
import {
  classifyLeadName,
  haversineMi,
  isUsableStreetAddress,
  normalizeCategory,
} from './openaiDiscovery.ts';

export const PLACES_APPROVAL_VERIFIER = 'admin_places_approval';
export const PLACES_APPROVAL_TIER = 1;

export function googlePlaceUrl(placeId: string): string {
  const id = String(placeId || '').trim();
  return id ? `https://www.google.com/maps/place/?q=place_id:${id}` : '';
}

export interface PlacesApprovalInput {
  name: string;
  category: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
  placeTypes?: string[];
  center: { lat: number; lng: number };
  radiusMi: number;
  existingListings: any[];
  adminId: string;
  jobId?: string;
  nowIso?: string;
}

export interface PlacesApprovalResult {
  ok: boolean;
  reason: string;
  checks: { key: string; pass: boolean; reason: string }[];
  listing: any | null;
  coordinates: { lat: number; lng: number } | null;
  distanceMiles: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function evaluatePlacesOnlyApproval(input: PlacesApprovalInput): PlacesApprovalResult {
  const checks: { key: string; pass: boolean; reason: string }[] = [];
  const add = (key: string, pass: boolean, reason = '') => {
    checks.push({ key, pass: !!pass, reason: pass ? '' : reason });
    return !!pass;
  };

  const name = String(input.name || '').trim();
  const placeId = String(input.placeId || '').trim();
  const address = String(input.address || '').trim();
  const lat = typeof input.latitude === 'number' && Number.isFinite(input.latitude) ? input.latitude : null;
  const lng = typeof input.longitude === 'number' && Number.isFinite(input.longitude) ? input.longitude : null;
  const radius = Math.min(Math.max(Number(input.radiusMi) || 30, 1), 30);
  const now = input.nowIso || new Date().toISOString();
  const coords = lat != null && lng != null ? { lat, lng } : null;

  const deny = (reason: string): PlacesApprovalResult => ({
    ok: false,
    reason,
    checks,
    listing: null,
    coordinates: coords,
    distanceMiles: null,
  });

  if (!add('name_present', name.length > 0, 'missing venue name')) return deny('missing venue name');

  const nameClass = classifyLeadName(name);
  if (!add('golf_business', !nameClass.excluded, nameClass.reason)) return deny(nameClass.reason);

  // A golf signal on the business itself is mandatory: this is the one
  // trust fact that does not depend on the venue having a website.
  const golf = isGolfRelated({ name, types: input.placeTypes || [] });
  if (!add('golf_signal', golf.isGolf, `no golf signal on this business (${golf.reason})`)) {
    return deny(`no golf signal on this business (${golf.reason})`);
  }

  if (!add('place_id', placeId.length > 0, 'no Google place_id on record')) {
    return deny('no Google place_id on record — the venue cannot be anchored');
  }

  if (!add('address_usable', isUsableStreetAddress(address), 'no usable street address')) {
    return deny('no usable street address');
  }

  if (!add('coordinates_present', !!coords, 'missing coordinates')) {
    return deny('missing coordinates');
  }

  const distance = haversineMi(input.center.lat, input.center.lng, coords!.lat, coords!.lng);
  if (!add('within_import_radius', distance <= radius, `out of import radius: ${round1(distance)} mi > ${radius} mi`)) {
    return deny(`out of import radius: ${round1(distance)} mi > ${radius} mi`);
  }

  const duplicate = findExistingDuplicate(
    { name, address, website: '', city: input.city, coords },
    input.existingListings
  );
  if (!add('not_duplicate', !duplicate.isDuplicate, `already listed: ${duplicate.reason}`)) {
    return deny(`already listed: ${duplicate.reason}`);
  }

  const category = normalizeCategory(input.category) || '';
  const type = category ? entityTypeForCategory(category) : 'golf_related_venue';

  const listing = {
    name,
    type,
    venue_name: name,
    city: input.city || '',
    state: input.state || '',
    address,
    latitude: coords!.lat,
    longitude: coords!.lng,
    phone: input.phone || '',
    website: '',
    official_website: '',
    official_domain: '',
    discovery_category: category,
    booking_url: '',
    hours: '',
    description: '',
    photos: [],
    rating: null,
    status: 'approved',
    place_id: placeId,
    source_url: googlePlaceUrl(placeId),
    source_type: 'google_places',
    verification_tier: PLACES_APPROVAL_TIER,
    verification_notes:
      'Published by an admin without an official website: venue confirmed from its Google Business Profile (place_id, street address, coordinates). No official-site corroboration was possible.',
    verified_at: now,
    verified_by: input.adminId,
    golf_verified: true,
    golf_verified_at: now,
    golf_verified_by: PLACES_APPROVAL_VERIFIER,
    photo_verified: false,
    is_professional_tournament: false,
    claim_status: 'unclaimed',
    ingestion_source: 'google_places',
    ingestion_job_id: input.jobId || '',
    source_urls_considered: googlePlaceUrl(placeId),
  };

  return {
    ok: true,
    reason: 'approved from a Google Business Profile (no official website)',
    checks,
    listing,
    coordinates: coords,
    distanceMiles: round1(distance),
  };
}