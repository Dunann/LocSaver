// Pure helpers for building, de-duplicating, and describing saved-location records.
import { isValidLatLng } from './parse.js';

export const SOURCES = ['geoguessr', 'gmaps', 'takeout'];

export function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Stable key for de-duplication: rounded coordinate (~1 m) + source. */
export function dedupeKey(lat, lng, source) {
  return `${source}:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

/** Normalise loosely-shaped input into a complete record. */
export function makeRecord(input) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  return {
    id: input.id || makeId(),
    lat,
    lng,
    label: (input.label || '').toString().trim() || null,
    country: input.country || null,
    countryCode: input.countryCode ? String(input.countryCode).toUpperCase() : null,
    region: input.region || null,
    city: input.city || null,
    source: SOURCES.includes(input.source) ? input.source : 'gmaps',
    sourceUrl: input.sourceUrl || null,
    notes: input.notes || '',
    tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function isPlaceable(rec) {
  return !!rec && isValidLatLng(Number(rec.lat), Number(rec.lng));
}

let _regionNames = null;
/** ISO 3166-1 alpha-2 -> English country name, via the built-in Intl API. */
export function countryNameFromCode(code) {
  if (!code) return null;
  try {
    _regionNames = _regionNames || new Intl.DisplayNames(['en'], { type: 'region' });
    return _regionNames.of(String(code).toUpperCase()) || null;
  } catch {
    return null;
  }
}

/** Google Maps deep link that opens the place so the user can save it manually. */
export function gmapsLink(rec) {
  if (isPlaceable(rec)) {
    return `https://www.google.com/maps/search/?api=1&query=${rec.lat}%2C${rec.lng}`;
  }
  return rec && rec.sourceUrl ? rec.sourceUrl : null;
}
