// ============================================================
// Listing Quarantine — deterministic, offline classification of
// records already sitting in the database.
//
// Purpose: the pre-policy import wrote Places-sourced rows straight
// to `approved` with no verification. Those rows (a) can never pass
// the public listing policy and (b) block deduplication for genuine
// venues discovered later, because the discovery pipeline matches
// on normalized name + city against every existing record.
//
// Rules are deliberately split into two tiers, because destroying
// real data is worse than leaving a hidden record in place:
//
//   quarantine (tier: out_of_scope | non_golf)
//     An explicit non-golf business signal (hotel, restaurant,
//     cemetery, church, school, retail chain, medical) or a hard
//     exclusion (disc golf). These are unambiguous. The record is
//     archived: hidden from players, kept for audit.
//
//   ambiguous (tier: ambiguous, NOT quarantined)
//     No golf vocabulary in the name AND no trusted source. Real
//     venues are named this way all the time ("The Courses at
//     Watters Creek", "PXG Dallas", "Legacy Ridge"), so these are
//     left untouched and merely reported. They are still hidden by
//     the public listing policy, and dedup now ignores archived
//     records, so they block nothing.
//
// No network access, no LLM, no API spend.
// ============================================================

import { classifyLeadName, hasGolfNameSignal } from './openaiDiscovery.ts';

export type QuarantineTier = 'out_of_scope' | 'non_golf' | 'ambiguous' | '';

export interface QuarantineVerdict {
  quarantine: boolean;
  archive: boolean;
  tier: QuarantineTier;
  reason: string;
}

// Source types that indicate a record was verified against an
// official venue page. Anything else (Places, business profile) is
// an untrusted lead, never a verified listing.
const TRUSTED_SOURCE_TYPES = new Set([
  'official_website',
  'event_website',
  'trusted_organization',
  'admin',
  'community_report',
]);

// A record carries a trusted source when it has a confirmed official
// website, or a source_type that only verification can set.
export function hasTrustedSource(record: any): boolean {
  if (!record) return false;
  if (typeof record.official_website === 'string' && record.official_website.trim()) return true;
  if (record.verified_at && TRUSTED_SOURCE_TYPES.has(String(record.source_type || ''))) return true;
  return TRUSTED_SOURCE_TYPES.has(String(record.source_type || ''));
}

export function classifyExistingListing(record: any): QuarantineVerdict {
  const name = String(record?.name || '');

  if (!name.trim()) {
    return { quarantine: true, archive: true, tier: 'non_golf', reason: 'missing venue name' };
  }

  const nameVerdict = classifyLeadName(name);
  if (nameVerdict.excluded) {
    const outOfScope = nameVerdict.reason.startsWith('out of scope');
    return {
      quarantine: true,
      archive: true,
      tier: outOfScope ? 'out_of_scope' : 'non_golf',
      reason: nameVerdict.reason,
    };
  }

  // Plausible golf venue named without golf vocabulary, and nothing
  // verifies it. Reported, never archived.
  if (!hasGolfNameSignal(name) && !hasTrustedSource(record)) {
    return {
      quarantine: false,
      archive: false,
      tier: 'ambiguous',
      reason: 'no golf signal in name and no trusted source — left in place, hidden by policy',
    };
  }

  return { quarantine: false, archive: false, tier: '', reason: '' };
}