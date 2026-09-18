// Build revision — manually maintained per release. Displayed in the app
// footer so preview and production can be distinguished. A true CI build
// hash requires a platform build-info API (deferred — decision for Trent).
export const BUILD_REVISION = '2026.09.18-2';
export const BUILD_DATE = '2026-09-18';
export function buildLabel() {
  return `Golfolio ${BUILD_REVISION}`;
}