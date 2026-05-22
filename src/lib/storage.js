// Thin wrapper over chrome.storage.local for saved locations + a geocode cache.
// (Runs in the service worker and the dashboard page — both have chrome.storage.)
import { makeRecord, dedupeKey } from './model.js';

const LOCATIONS_KEY = 'locsaver:locations';
const GEOCACHE_KEY = 'locsaver:geocache';

export async function getAllLocations() {
  const o = await chrome.storage.local.get(LOCATIONS_KEY);
  return o[LOCATIONS_KEY] || [];
}

async function setAllLocations(list) {
  await chrome.storage.local.set({ [LOCATIONS_KEY]: list });
  return list;
}

export async function countLocations() {
  return (await getAllLocations()).length;
}

/** Add one record. Returns { record, duplicate }. */
export async function addLocation(input) {
  const rec = makeRecord(input);
  const list = await getAllLocations();
  const key = dedupeKey(rec.lat, rec.lng, rec.source);
  const existing = list.find((r) => dedupeKey(r.lat, r.lng, r.source) === key);
  if (existing) return { record: existing, duplicate: true };
  list.push(rec);
  await setAllLocations(list);
  return { record: rec, duplicate: false };
}

/** Bulk add with in-batch + against-existing de-duplication. */
export async function addMany(inputs) {
  const list = await getAllLocations();
  const seen = new Set(list.map((r) => dedupeKey(r.lat, r.lng, r.source)));
  let added = 0;
  let skipped = 0;
  for (const input of inputs) {
    const rec = makeRecord(input);
    const key = dedupeKey(rec.lat, rec.lng, rec.source);
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    list.push(rec);
    added++;
  }
  await setAllLocations(list);
  return { added, skipped };
}

export async function updateLocation(id, patch) {
  const list = await getAllLocations();
  const i = list.findIndex((r) => r.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], ...patch, id };
  await setAllLocations(list);
  return list[i];
}

export async function deleteLocation(id) {
  const list = await getAllLocations();
  await setAllLocations(list.filter((r) => r.id !== id));
}

export async function clearAll() {
  await setAllLocations([]);
}

// --- geocode cache, keyed at ~110 m resolution to avoid repeat lookups ---

function geoKey(lat, lng) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

export async function getCachedGeocode(lat, lng) {
  const o = await chrome.storage.local.get(GEOCACHE_KEY);
  return (o[GEOCACHE_KEY] || {})[geoKey(lat, lng)] || null;
}

export async function setCachedGeocode(lat, lng, value) {
  const o = await chrome.storage.local.get(GEOCACHE_KEY);
  const cache = o[GEOCACHE_KEY] || {};
  cache[geoKey(lat, lng)] = value;
  await chrome.storage.local.set({ [GEOCACHE_KEY]: cache });
}
