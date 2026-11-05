// ============================================================
// Candidate verification — the ONE orchestration of
//   fetch official page → resolve street address → evaluate gates
//
// Used by the discovery run, the re-verification pass, and the
// admin approval action, so a venue is always judged by exactly the
// same gates no matter which path reached it.
//
// No approval happens here. evaluateLead() owns every gate.
// ============================================================

import { fetchSourceDocument } from './automatedVerification.ts';
import { isTrustedSourceUrl } from './publicListingPolicy.ts';
import { isBlockedHost } from './photoValidation.ts';
import { normalizeWebsiteUrl } from './openaiDiscovery.ts';
import { evaluateLead, extractOfficialBookingUrl } from './officialSourceVerification.ts';
import { resolveLeadAddress, cleanField } from './leadAddress.ts';

export interface CandidateVerificationInput {
  // { name, category, city, state, address, website, latitude, longitude, phone }
  lead: any;
  placesKey?: string;
  center: { lat: number; lng: number };
  radiusMi: number;
  existingListings: any[];
  searchEvidenceUrls?: string[];
  jobId?: string;
  // The run caps source fetches per query; false skips the fetch.
  canFetchSource?: boolean;
  nowIso?: string;
}

export async function verifyLeadAgainstOfficialSource(input: CandidateVerificationInput) {
  const website = normalizeWebsiteUrl(input.lead?.website);
  const canFetch = input.canFetchSource !== false;
  const doc =
    canFetch && website && isTrustedSourceUrl(website) && !isBlockedHost(website)
      ? await fetchSourceDocument(website)
      : null;

  const resolved = await resolveLeadAddress({ placesKey: input.placesKey, lead: input.lead });
  const lead = {
    ...input.lead,
    address: resolved?.address || cleanField(input.lead?.address),
    city: cleanField(input.lead?.city) || resolved?.city || '',
    state: cleanField(input.lead?.state) || resolved?.state || '',
  };

  const evaluation = evaluateLead({
    lead,
    pageText: doc?.ok ? doc.text : '',
    html: doc?.ok ? doc.html : '',
    sourceUrl: website,
    finalUrl: doc?.ok ? doc.finalUrl : website,
    center: input.center,
    radiusMi: input.radiusMi,
    existingListings: input.existingListings,
    geocoded: resolved?.geocoded || null,
    searchEvidenceUrls: input.searchEvidenceUrls || [],
    jobId: input.jobId,
    bookingUrl: doc?.ok ? extractOfficialBookingUrl(doc.html, doc.finalUrl) : '',
    nowIso: input.nowIso,
  });

  return { lead, website, doc, resolved, evaluation };
}