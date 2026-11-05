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
import { isUsableStreetAddress, normalizeWebsiteUrl } from './openaiDiscovery.ts';
import {
  evaluateLead,
  extractOfficialBookingUrl,
  findContactPageUrl,
} from './officialSourceVerification.ts';
import { resolveLeadAddress, cleanField } from './leadAddress.ts';
import { enrichVenue } from './venueEnrichment.ts';

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
  // Optional second source: the Google Business Profile for this venue is
  // always consulted, and a web search may be spent to find a missing
  // official website.
  openaiKey?: string;
  allowWebsiteSearch?: boolean;
  nowIso?: string;
}

export async function verifyLeadAgainstOfficialSource(input: CandidateVerificationInput) {
  // Whether the LEAD itself carried a street address, decided before any
  // enrichment fills one in. Only that pairing can veto a venue through
  // coordinate disagreement.
  const leadHadOwnAddress = isUsableStreetAddress(cleanField(input.lead?.address));

  // Two sources, one dossier: the Google Business Profile supplies the
  // canonical address, phone, rating and place_id, and fills in the
  // official website when the lead arrived without one.
  const enrichment = await enrichVenue({
    placesKey: input.placesKey,
    openaiKey: input.openaiKey,
    allowWebsiteSearch: input.allowWebsiteSearch === true,
    placeId: input.lead?.place_id,
    name: cleanField(input.lead?.name),
    city: cleanField(input.lead?.city),
    state: cleanField(input.lead?.state),
    address: cleanField(input.lead?.address),
    website: input.lead?.website,
  }).catch(() => null);

  const place = enrichment?.place || null;
  const website = enrichment?.website || normalizeWebsiteUrl(input.lead?.website);
  const canFetch = input.canFetchSource !== false;
  const fetchable = canFetch && website && isTrustedSourceUrl(website) && !isBlockedHost(website);

  let fetchesUsed = 0;
  const doc = fetchable ? await fetchSourceDocument(website) : null;
  if (doc) fetchesUsed++;

  const merged = {
    ...input.lead,
    address: cleanField(input.lead?.address) || place?.formatted_address || '',
    city: cleanField(input.lead?.city) || place?.city || '',
    state: cleanField(input.lead?.state) || place?.state || '',
    phone: cleanField(input.lead?.phone) || place?.phone || '',
    place_id: String(input.lead?.place_id || place?.place_id || ''),
    website,
  };

  const resolved = await resolveLeadAddress({ placesKey: input.placesKey, lead: merged });
  // When the lead's own address cannot be geocoded (no postal code, a
  // partial street line) but Google knows this business, Google's canonical
  // address is the second source doing its job — never a guess.
  let placeResolved = resolved;
  if (!resolved?.geocoded && place?.formatted_address) {
    const second = await resolveLeadAddress({
      placesKey: input.placesKey,
      lead: { ...merged, address: place.formatted_address },
    }).catch(() => null);
    if (second?.geocoded) placeResolved = second;
  }
  const lead = {
    ...merged,
    address: placeResolved?.address || merged.address,
    city: merged.city || placeResolved?.city || '',
    state: merged.state || placeResolved?.state || '',
  };

  // The lead's own coordinates only have to agree when the lead carried
  // its own address. A resolved-by-lookup address has no such pairing.
  const requireCoordinateAgreement = leadHadOwnAddress;

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
      geocoded: placeResolved?.geocoded || null,
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

  return { lead, website, doc, resolved: placeResolved, evaluation, fetchesUsed, enrichment };
}