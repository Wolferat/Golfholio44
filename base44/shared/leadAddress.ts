// ============================================================
// Lead address resolution.
//
// Leads arrive from a model web search and frequently carry no
// street address (or only a city). Without a street address the
// verification gate cannot confirm a location on the official page,
// so the venue is rejected even when it is real.
//
// This resolves ONE canonical street address per lead:
//   1. If the lead already has a usable street address, geocode it.
//   2. Otherwise look the venue up by name + city + state and take
//      the formatted address Google returns.
//
// It never invents an address: if neither path produces a street
// address with a number, resolution returns null and the venue is
// rejected. Google Places is used ONLY to source/geocode an address
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
  method: 'lead_address' | 'places_find_place';
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

export async function resolveLeadAddress(input: {
  placesKey?: string;
  lead: any;
}): Promise<ResolvedLeadAddress | null> {
  const lead = input.lead || {};
  const key = String(input.placesKey || '').trim();
  const given = String(lead.address || '').trim();

  if (isUsableStreetAddress(given)) {
    const g = key ? await geocode(key, given).catch(() => null) : null;
    return {
      address: g?.formatted_address || given,
      city: lead.city || g?.locality || '',
      state: lead.state || g?.admin_area || '',
      method: 'lead_address',
      geocoded: g
        ? {
            lat: g.lat,
            lng: g.lng,
            postal_code: g.postal_code || '',
            street_line: g.street_line || '',
            formatted_address: g.formatted_address || '',
            locality: g.locality || '',
            admin_area: g.admin_area || '',
          }
        : null,
    };
  }

  if (!key) return null;

  const found = await findPlaceAddress(key, lead.name, lead.city, lead.state).catch(() => null);
  if (!found || !isUsableStreetAddress(found.formatted_address)) return null;

  return {
    address: found.formatted_address,
    city: lead.city || found.city || '',
    state: lead.state || found.state || '',
    method: 'places_find_place',
    geocoded: {
      lat: found.lat,
      lng: found.lng,
      postal_code: found.postal_code || '',
      street_line: found.street_line || '',
      formatted_address: found.formatted_address || '',
      locality: found.city || '',
      admin_area: found.state || '',
    },
  };
}