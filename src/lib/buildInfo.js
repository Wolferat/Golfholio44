// Build environment detection — the strongest truthful version identity
// available in Base44. The platform injects VITE_BASE44_APP_BASE_URL
// during preview/dev builds; it is undefined in production builds.
//
// LIMITATION: Base44 does NOT expose a build hash, commit ID, or deploy
// revision to the running app. The BUILD_REVISION below is a manual
// human-readable tag — NOT a verified build hash. Preview/publish
// equivalence cannot be automatically verified from within the app.
// The environment label (Preview/Production) is the only platform-derived
// signal; it tells you WHERE the code is running, not exactly which
// source revision was deployed.
const PREVIEW_BASE_URL = import.meta.env.VITE_BASE44_APP_BASE_URL;
export const IS_PREVIEW = !!PREVIEW_BASE_URL;
export const BUILD_ENV = IS_PREVIEW ? 'preview' : 'production';
export const BUILD_REVISION = '2026.09.18-8';
export const BUILD_DATE = '2026-09-18';
export function buildLabel() {
  return `Golfolio ${BUILD_REVISION} · ${IS_PREVIEW ? 'Preview' : 'Production'}`;
}
export function isPreviewBuild() { return IS_PREVIEW; }