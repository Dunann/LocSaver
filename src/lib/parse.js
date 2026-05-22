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

/** Parse a "lat,lng" or "lat~lng" (Bing) string into a validated [lat, lng]. */
export function parseLatLngString(s) {
  if (s == null) return null;
  const m = String(s).match(/(-?\d+(?:\.\d+)?)\s*[,~]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return isValidLatLng(lat, lng) ? [lat, lng] : null;
}

/** Return the first of `keys` that holds a coordinate, searching query AND hash. */
export function coordFromParams(url, keys) {
  for (const key of keys) {
    const m = url.match(new RegExp(`[?&#]${key}=([^&]+)`, 'i'));
    if (m) {
      let v = m[1];
      try { v = decodeURIComponent(v); } catch { /* keep raw */ }
      const pair = parseLatLngString(v);
      if (pair) return pair;
    }
  }
  return null;
}

/** Pull a human label out of a `name=`/`q=` param, ignoring numeric coordinates. */
function labelFromParams(url, keys) {
  for (const key of keys) {
    const m = url.match(new RegExp(`[?&]${key}=([^&]+)`, 'i'));
    if (m) {
      let v = m[1];
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* keep raw */ }
      v = v.trim();
      if (v && !/^-?\d+(?:\.\d+)?\s*[,~]/.test(v)) return v;
    }
  }
  return null;
}

/**
 * Extract { lat, lng, label } from a Google Maps URL when possible.
 * The `!3d<lat>!4d<lng>` data segment is the precise place coordinate;
 * `@<lat>,<lng>` is only the map centre, so it ranks last.
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
  const data = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (data) candidates.push([parseFloat(data[1]), parseFloat(data[2])]);

  const param = url.match(/[?&](?:q|query|ll|center|sll|destination)=([^&]+)/i);
  if (param) {
    let val = param[1];
    try { val = decodeURIComponent(val); } catch { /* keep raw */ }
    const m = val.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) candidates.push([parseFloat(m[1]), parseFloat(m[2])]);
  }

  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) candidates.push([parseFloat(at[1]), parseFloat(at[2])]);

  for (const [lat, lng] of candidates) {
    if (isValidLatLng(lat, lng)) return { lat, lng, label };
  }
  return label ? { lat: null, lng: null, label } : null;
}

/** Apple Maps web URL: coordinate lives in ll / coordinate / sll / q / center. */
export function parseAppleMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const label = labelFromParams(url, ['name', 'q']);
  const pair = coordFromParams(url, ['ll', 'coordinate', 'sll', 'q', 'center']);
  if (pair) return { lat: pair[0], lng: pair[1], label };
  return label ? { lat: null, lng: null, label } : null;
}

/** Bing Maps: center is cp=lat~lng; pushpins are sp=point.lat_lng_label. */
export function parseBingUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const label = labelFromParams(url, ['q', 'where1']);
  const pin = url.match(/[?&]sp=point\.(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)/i);
  if (pin) {
    const lat = parseFloat(pin[1]);
    const lng = parseFloat(pin[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, label };
  }
  const pair = coordFromParams(url, ['cp']);
  if (pair) return { lat: pair[0], lng: pair[1], label };
  return label ? { lat: null, lng: null, label } : null;
}
