// LocSaver background service worker (ES module).
// Owns the single "save" pipeline: parse -> reverse-geocode -> store -> badge.
// Content scripts can't make cross-origin geocoding requests (page CSP/CORS),
// so they send coordinates here and we do the network + storage work.
import { parseGmapsUrl } from '../lib/parse.js';
import { reverseGeocode } from '../lib/geocode.js';
import {
  addLocation, getCachedGeocode, setCachedGeocode, countLocations,
} from '../lib/storage.js';
import { countryNameFromCode } from '../lib/model.js';

const DASHBOARD_URL = chrome.runtime.getURL('src/dashboard/dashboard.html');

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#0e7c66' });
  refreshBadge();
});
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(refreshBadge);

// Clicking the toolbar icon opens (or focuses) the dashboard.
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: DASHBOARD_URL });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: DASHBOARD_URL });
  }
});

async function refreshBadge() {
  try {
    const n = await countLocations();
    await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  } catch { /* action API may be briefly unavailable on install */ }
}

async function cachedReverseGeocode(lat, lng) {
  const hit = await getCachedGeocode(lat, lng);
  if (hit) return hit;
  const res = await reverseGeocode(lat, lng);
  if (res && (res.country || res.countryCode)) await setCachedGeocode(lat, lng, res);
  return res;
}

async function handleSave(payload = {}) {
  let { lat, lng, label, source, sourceUrl } = payload;

  // The Google Maps content script sends a raw URL rather than coordinates.
  if ((lat == null || lng == null) && payload.url) {
    const parsed = parseGmapsUrl(payload.url);
    if (parsed) { lat = parsed.lat; lng = parsed.lng; label = label || parsed.label; }
    sourceUrl = sourceUrl || payload.url;
  }

  lat = Number(lat);
  lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'no-coordinates' };
  }

  const geo = await cachedReverseGeocode(lat, lng).catch(() => null);
  const { record, duplicate } = await addLocation({
    lat, lng, label, source, sourceUrl,
    country: (geo && geo.country) || countryNameFromCode(geo && geo.countryCode) || null,
    countryCode: (geo && geo.countryCode) || null,
    region: (geo && geo.region) || null,
    city: (geo && geo.city) || null,
  });
  await refreshBadge();
  return { ok: true, duplicate, record };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'SAVE_LOCATION') {
        sendResponse(await handleSave(msg.payload || msg));
      } else if (msg && msg.type === 'REFRESH_BADGE') {
        await refreshBadge();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'unknown-message' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the channel open for the async sendResponse
});
