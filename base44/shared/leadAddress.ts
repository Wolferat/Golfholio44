// ============================================================
// Lead address resolution.
//
// Leads arrive from a model web search and frequently carry no street
// address (or only a city, or a placeholder such as "Not specified").
// Without a street address the verification gate cannot confirm a
// location on the official page, so the venue is rejected even when it
// is real.
//
// This resolves ONE canonical street address per lead:
//   1. If the lead already has a usable street address, geocode it.
//   2. Otherwise look the venue up by name + city + state and take the
//      formatted address Google returns, then geocode that.
//
// It never invents an address: if neither path produces a street
// address with a number, resolution returns null and the venue is
// rejected. Google Places/Geocoding is used ONLY to source an address
// — it is never evidence of anything, and the official page must
// still independently confirm the address before approval.
// ============================================================

import { findPlaceAddress, geocode } from './googlePlaces.ts';
import { isUsableStreetAddress } from './openaiDiscovery.ts';

export interface ResolvedLeadAddress {
  address: string;
  city: string;
  state: string;
  // How the address was obtained — recorded in the evidence for audit.
  method: 'lead_address' | 'places_text_search';
  geocoded: {
    lat: number;
    lng: number;
    postal_code?: string;
    street_line?: string;
    formatted_address?: string;
    locality?: string;
    admin_area?: string;
  } | null;
}

// Models fill unknowns with placeholders. Treat them as empty so they
// never reach a lookup query or the published record.
const PLACEHOLDERS = /^(not specified|not available|not provided|unknown|n\/a|na|none|null|tbd|-+|—)$/i;

export function cleanField(value: any): string {
  const raw = String(value ?? '').trim();
  if (!raw || PLACEHOLDERS.test(raw)) return '';
  return raw;
}

function geocodedFrom(g: any) {
  if (!g) return null;
  return {
    lat: g.lat,
    lng: g.lng,
    postal_code: g.postal_code || '',
    street_line: g.street_line || '',
    formatted_address: g.formatted_address || '',
    locality: g.locality || '',
    admin_area: g.admin_area || '',
  };
}

export async function resolveLeadAddress(input: {
  placesKey?: string;
  lead: any;
}): Promise<ResolvedLeadAddress | null> {
  const lead = input.lead || {};
  const key = String(input.placesKey || '').trim();
  const given = cleanField(lead.address);
  const city = cleanField(lead.city);
  const state = cleanField(lead.state);

  if (isUsableStreetAddress(given)) {
    const g = key ? await geocode(key, given).catch(() => null) : null;
    return {
      address: g?.formatted_address || given,
      city: city || cleanField(g?.locality),
      state: state || cleanField(g?.admin_area),
      method: 'lead_address',
      geocoded: geocodedFrom(g),
    };
  }

  if (!key) return null;

  const found = await findPlaceAddress(key, cleanField(lead.name), city, state).catch(() => null);
  if (!found || !isUsableStreetAddress(found.formatted_address)) return null;

  // Geocode the resolved address for its canonical postal code and
  // street line — the facts the official page must confirm.
  const g = await geocode(key, found.formatted_address).catch(() => null);

  return {
    address: g?.formatted_address || found.formatted_address,
    city: city || cleanField(g?.locality),
    state: state || cleanField(g?.admin_area),
    method: 'places_text_search',
    geocoded:
      geocodedFrom(g) ||
      (typeof found.lat === 'number' && typeof found.lng === 'number'
        ? { lat: found.lat, lng: found.lng, formatted_address: found.formatted_address, postal_code: '', street_line: '' }
        : null),
  };
}