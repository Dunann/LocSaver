// Reverse geocoding: coordinate -> { country, countryCode, region, city }.
//
// Network calls run from the service worker or the dashboard page, both of which
// hold host_permissions for the two providers (so they bypass page CSP/CORS).
// The normalisers are pure and exported separately so they can be unit-tested.

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

const BDC = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const EMPTY = { country: null, countryCode: null, region: null, city: null };

/**
 * Resolve a coordinate to admin areas. Tries BigDataCloud (free, keyless) first,
 * then OpenStreetMap Nominatim. Never throws — returns EMPTY on total failure.
 * `fetchImpl` is injectable for testing.
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
