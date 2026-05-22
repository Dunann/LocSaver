// Pure geo-parsing helpers shared by the service worker, dashboard, and tests.
// Deliberately free of chrome.* and DOM access so it can be unit-tested in Node.

/** True for a usable WGS84 coordinate. Rejects the (0,0) "null island" too. */
export function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Extract { lat, lng, label } from a Google Maps URL when possible.
 *
 * Preference order matters: the `!3d<lat>!4d<lng>` "data" segment is the precise
 * coordinate of a selected place, whereas `@<lat>,<lng>` is only the map centre.
 * Returns null if no coordinate can be found (a label-only result is still
 * returned so callers can surface the name).
 */
export function parseGmapsUrl(url) {
  if (!url || typeof url !== 'string') return null;

  let label = null;
  const placeMatch = url.match(/\/maps\/place\/([^/@]+)/);
  if (placeMatch) {
    try {
      label = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      label = placeMatch[1].replace(/\+/g, ' ').trim();
    }
  }

  const candidates = [];

  // 1. Precise place coordinate: !3d<lat>!4d<lng>
  const data = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (data) candidates.push([parseFloat(data[1]), parseFloat(data[2])]);

  // 2. Explicit query coordinate: q= / query= / ll= / center= / sll=
  const param = url.match(/[?&](?:q|query|ll|center|sll|destination)=([^&]+)/i);
  if (param) {
    let val = param[1];
    try { val = decodeURIComponent(val); } catch { /* keep raw */ }
    const m = val.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) candidates.push([parseFloat(m[1]), parseFloat(m[2])]);
  }

  // 3. Map centre: @<lat>,<lng>,<zoom>
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) candidates.push([parseFloat(at[1]), parseFloat(at[2])]);

  for (const [lat, lng] of candidates) {
    if (isValidLatLng(lat, lng)) return { lat, lng, label };
  }
  return label ? { lat: null, lng: null, label } : null;
}
