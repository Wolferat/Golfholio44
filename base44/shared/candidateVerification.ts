// ============================================================
// Candidate verification — the ONE orchestration of
//   fetch official page → resolve street address → evaluate gates
//
// Used by the discovery run, the re-verification pass, and the admin
// approval action, so a venue is always judged by exactly the same
// gates no matter which path reached it.
//
// Two things make a REAL venue pass instead of being thrown away:
//   - a street address is resolved before the gates run (many leads
//     arrive with none, and without one no location can be confirmed);
//   - when the home page does not establish the venue, one same-site
//     contact/directions page is read too, because that is where most
//     club sites actually publish their address.
//
// No approval happens here. evaluateLead() owns every gate.
// ============================================================

import { fetchSourceDocument } from './automatedVerification.ts';
import { isTrustedSourceUrl } from './publicListingPolicy.ts';
import { isBlockedHost } from './photoValidation.ts';
import { normalizeWebsiteUrl } from './openaiDiscovery.ts';
import {
  evaluateLead,
  extractOfficialBookingUrl,
  findContactPageUrl,
} from './officialSourceVerification.ts';
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
  // Places-sourced leads have a place_id, not a web-search trail.
  requireSearchEvidence?: boolean;
  nowIso?: string;
}

export async function verifyLeadAgainstOfficialSource(input: CandidateVerificationInput) {
  const website = normalizeWebsiteUrl(input.lead?.website);
  const canFetch = input.canFetchSource !== false;
  const fetchable = canFetch && website && isTrustedSourceUrl(website) && !isBlockedHost(website);

  let fetchesUsed = 0;
  const doc = fetchable ? await fetchSourceDocument(website) : null;
  if (doc) fetchesUsed++;

  const resolved = await resolveLeadAddress({ placesKey: input.placesKey, lead: input.lead });
  const lead = {
    ...input.lead,
    address: resolved?.address || cleanField(input.lead?.address),
    city: cleanField(input.lead?.city) || resolved?.city || '',
    state: cleanField(input.lead?.state) || resolved?.state || '',
  };

  // The lead's own coordinates only have to agree when the lead carried
  // its own address. A resolved-by-lookup address has no such pairing.
  const requireCoordinateAgreement = resolved?.method === 'lead_address';

  const run = (pageText: string, html: string) =>
    evaluateLead({
      lead,
      pageText,
      html,
      sourceUrl: website,
      finalUrl: doc?.ok ? doc.finalUrl : website,
      center: input.center,
      radiusMi: input.radiusMi,
      existingListings: input.existingListings,
      geocoded: resolved?.geocoded || null,
      searchEvidenceUrls: input.searchEvidenceUrls || [],
      jobId: input.jobId,
      bookingUrl: html && doc?.ok ? extractOfficialBookingUrl(html, doc.finalUrl) : '',
      nowIso: input.nowIso,
      sourceError: doc && !doc.ok ? doc.reason : '',
      requireCoordinateAgreement,
      requireSearchEvidence: input.requireSearchEvidence,
    });

  let evaluation = run(doc?.ok ? doc.text : '', doc?.ok ? doc.html : '');

  // One retry against a same-site contact/directions page. Many club
  // home pages show no address at all; the contact page does.
  if (evaluation.status !== 'accepted' && doc?.ok) {
    const contactUrl = findContactPageUrl(doc.html, doc.finalUrl);
    if (contactUrl && contactUrl !== doc.finalUrl) {
      const contact = await fetchSourceDocument(contactUrl);
      if (contact) fetchesUsed++;
      if (contact?.ok) {
        const second = run(`${doc.text} ${contact.text}`, doc.html);
        if (second.status === 'accepted') evaluation = second;
      }
    }
  }

  return { lead, website, doc, resolved, evaluation, fetchesUsed };
}