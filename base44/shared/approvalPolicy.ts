// ============================================================
// Approval Policy — the sole authority for confirming the official
// source URL when an admin approves a listing.
//
// A generic `website` field (Google Places, directory, social, or any
// inferred URL) is NEVER trusted and may never populate `source_url`.
// Only one of these may populate `source_url`, and only when the admin
// explicitly confirms it in the SAME approval action:
//   1. an explicit `source_url` provided in the request, OR
//   2. the existing `official_website`, confirmed via confirm_official_website, OR
//   3. the existing `official_registration_url`, confirmed via confirm_official_registration_url.
// All URLs must be http: or https:.
// ============================================================

function isValidHttpUrl(u) {
  if (!u || typeof u !== 'string') return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Returns { ok, sourceUrl, reason }. When ok is false, sourceUrl is null
// and reason explains why no confirmed source could be established.
export function resolveConfirmedSourceUrl(record, body) {
  if (!body || typeof body !== 'object') body = {};
  if (!record) record = {};

  // 1. Explicit source_url supplied by the admin in this action.
  const explicit = body.source_url != null ? String(body.source_url).trim() : '';
  if (explicit !== '') {
    if (!isValidHttpUrl(explicit)) {
      return { ok: false, sourceUrl: null, reason: 'source_url must be a valid http/https URL' };
    }
    return { ok: true, sourceUrl: explicit, reason: null };
  }

  // 2. Admin explicitly confirms the existing official_website in this action.
  if (body.confirm_official_website === true) {
    const u = record.official_website;
    if (!isValidHttpUrl(u)) {
      return { ok: false, sourceUrl: null, reason: 'official_website is missing or not a valid http/https URL' };
    }
    return { ok: true, sourceUrl: u, reason: null };
  }

  // 3. Admin explicitly confirms the existing official_registration_url in this action.
  if (body.confirm_official_registration_url === true) {
    const u = record.official_registration_url;
    if (!isValidHttpUrl(u)) {
      return { ok: false, sourceUrl: null, reason: 'official_registration_url is missing or not a valid http/https URL' };
    }
    return { ok: true, sourceUrl: u, reason: null };
  }

  // No confirmed source. The generic `website` field is deliberately NOT
  // considered — it is not a trusted source.
  return {
    ok: false,
    sourceUrl: null,
    reason:
      'No confirmed official source URL. Provide source_url, or set confirm_official_website or confirm_official_registration_url. A generic website field is not accepted.',
  };
}