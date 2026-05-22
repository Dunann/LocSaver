// Geocoding: coordinate <-> place. Reverse (coord -> country/region/city) and
// forward (place/address text -> coordinate).
//
// Network calls run from the service worker or the dashboard page, both of which
// hold host_permissions for the providers (so they bypass page CSP/CORS).
// The normalisers are pure and exported separately so they can be unit-tested.
import { isValidLatLng } from './parse.js';

export function normalizeBigDataCloud(j) {
  if (!j) return null;
  const country = j.countryName || null;
  if (!country && !j.countryCode) return null;
  return {
    country,
    countryCode: j.countryCode || null,
    region: j.principalSubdivision || null,
    city: j.city || j.locality || null,
  };
}

export function normalizeNominatim(j) {
  const a = j && j.address;
  if (!a) return null;
  return {
    country: a.country || null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    region: a.state || a.region || a.county || null,
    city: a.city || a.town || a.village || a.municipality || a.hamlet || null,
  };
}

/** First result of a Nominatim /search response -> a location candidate. */
export function normalizeNominatimSearch(arr) {
  const r = Array.isArray(arr) ? arr[0] : null;
  if (!r) return null;
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!isValidLatLng(lat, lng)) return null;
  const a = r.address || {};
  return {
    lat,
    lng,
    label: r.name || (r.display_name ? r.display_name.split(',')[0].trim() : null),
    displayName: r.display_name || null,
    country: a.country || null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    region: a.state || a.region || a.county || null,
    city: a.city || a.town || a.village || a.municipality || null,
  };
}

const BDC = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const EMPTY = { country: null, countryCode: null, region: null, city: null };

/**
 * Resolve a coordinate to admin areas. Tries BigDataCloud (free, keyless) first,
 * then OpenStreetMap Nominatim. Never throws — returns EMPTY on total failure.
 */
export async function reverseGeocode(lat, lng, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`${BDC}?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (r.ok) {
      const norm = normalizeBigDataCloud(await r.json());
      if (norm && norm.country) return norm;
    }
  } catch { /* fall through to Nominatim */ }

  try {
    const r = await fetchImpl(
      `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=5&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    );
    if (r.ok) {
      const norm = normalizeNominatim(await r.json());
      if (norm) return norm;
    }
  } catch { /* fall through to EMPTY */ }

  return { ...EMPTY };
}

/** Forward geocode a place/address string to a coordinate (Nominatim search). */
export async function forwardGeocode(query, fetchImpl = fetch) {
  if (!query || !query.trim()) return null;
  try {
    const u = `${NOMINATIM_SEARCH}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query.trim())}`;
    const r = await fetchImpl(u, { headers: { Accept: 'application/json' } });
    if (r.ok) return normalizeNominatimSearch(await r.json());
  } catch { /* ignore */ }
  return null;
}
