// ============================================================
// Platform-aware directions URL builder.
//
// - iOS/iPadOS: opens Apple Maps
// - Android: opens Google Maps app or web
// - Desktop/other: opens Google Maps web
//
// Uses verified coordinates when available; otherwise uses the
// verified structured address. Destination name is included
// safely encoded.
// ============================================================

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  );
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function canShowDirections(item) {
  if (!item) return false;
  return !!(
    (item.latitude && item.longitude) ||
    item.address ||
    item.location ||
    item.name
  );
}

export function getDirectionsUrl(item) {
  if (!item) return '#';

  const hasCoords = item.latitude && item.longitude;
  const name = item.name || '';
  const address = item.address || '';

  if (isIOS()) {
    // Apple Maps URL — opens Apple Maps on iOS/iPadOS
    const params = new URLSearchParams();
    if (hasCoords) {
      params.set('ll', `${item.latitude},${item.longitude}`);
      params.set('q', name || address);
    } else {
      params.set('address', address);
      params.set('q', name || address);
    }
    return `https://maps.apple.com/?${params.toString()}`;
  }

  // Android + desktop: Google Maps
  const query = hasCoords
    ? `${item.latitude},${item.longitude}`
    : encodeURIComponent(address || name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}