// LocSaver background service worker (ES module).
// Owns the "save" pipeline (parse -> reverse-geocode -> store -> badge) and the
// right-click "find a location on this page" flow.
import { providerForUrl } from '../lib/providers.js';
import { reverseGeocode, forwardGeocode } from '../lib/geocode.js';
import {
  addLocation, getCachedGeocode, setCachedGeocode, countLocations,
} from '../lib/storage.js';
import { countryNameFromCode } from '../lib/model.js';
import { rankWebCandidates } from '../lib/pagescan.js';

const DASHBOARD_URL = chrome.runtime.getURL('src/dashboard/dashboard.html');
const PENDING_KEY = 'locsaver:pending';

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#0e7c66' });
  refreshBadge();
  chrome.contextMenus.create({
    id: 'lsv-find-location',
    title: 'LocSaver: find a location on this page',
    contexts: ['page', 'selection'],
  }, () => { void chrome.runtime.lastError; });
});
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(refreshBadge);

chrome.action.onClicked.addListener(openDashboard);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lsv-find-location' && tab && tab.id != null) findOnPage(tab.id);
});

async function openDashboard() {
  const tabs = await chrome.tabs.query({ url: DASHBOARD_URL });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD_URL });
  }
}

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

  // Web-map content scripts send a raw URL; resolve the provider + coordinate.
  if ((lat == null || lng == null) && payload.url) {
    const provider = providerForUrl(payload.url);
    if (provider) {
      source = source || provider.id;
      const parsed = provider.parse(payload.url);
      if (parsed) { lat = parsed.lat; lng = parsed.lng; label = label || parsed.label; }
    }
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

// ---- Feature: scour an arbitrary page, then hand candidates to the dashboard ----
async function findOnPage(tabId) {
  let extracted = null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageLocationExtractor });
    extracted = res && res.result;
  } catch { extracted = null; } // restricted pages (chrome://, web store, …)

  const pending = {
    pageTitle: (extracted && extracted.pageTitle) || '',
    pageUrl: (extracted && extracted.pageUrl) || '',
    candidates: [],
  };

  if (extracted) {
    const raw = (extracted.coords || []).map((c) => ({
      lat: c.lat, lng: c.lng, label: c.label || extracted.pageTitle, confidence: 'structured',
    }));
    const queries = [
      ...(extracted.addresses || []).map((a) => ({ q: a.address, label: a.label, confidence: 'address' })),
      ...(extracted.names || []).map((n) => ({ q: n.name, label: n.name, confidence: 'text' })),
    ];
    for (const item of queries) {
      if (raw.length >= 10) break;
      const g = await forwardGeocode(item.q).catch(() => null);
      if (g) {
        raw.push({
          lat: g.lat, lng: g.lng, label: item.label || g.label || item.q, confidence: item.confidence,
          country: g.country, countryCode: g.countryCode, region: g.region, city: g.city,
        });
      }
    }
    pending.candidates = rankWebCandidates(raw).slice(0, 6);
  }

  await chrome.storage.local.set({ [PENDING_KEY]: pending });
  await openDashboard();
}

// Injected into the page (must be fully self-contained — no outer references).
function pageLocationExtractor() {
  const coords = [];
  const seen = new Set();
  const valid = (a, b) => Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
  const addCoord = (lat, lng, label) => {
    lat = Number(lat); lng = Number(lng);
    if (!valid(lat, lng)) return;
    const k = lat.toFixed(4) + ',' + lng.toFixed(4);
    if (seen.has(k)) return;
    seen.add(k);
    coords.push({ lat, lng, label: label || null });
  };
  const addresses = [];
  const names = [];
  const meta = (sel) => { const m = document.querySelector(sel); return m && m.getAttribute('content'); };

  // schema.org JSON-LD (places, businesses, events, …)
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let data;
    try { data = JSON.parse(s.textContent); } catch { return; }
    const stack = Array.isArray(data) ? data.slice() : [data];
    let guard = 0;
    while (stack.length && guard++ < 800) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { stack.push(...o); continue; }
      const g = o.geo;
      if (g && g.latitude != null && g.longitude != null) addCoord(g.latitude, g.longitude, o.name);
      const a = o.address;
      if (typeof a === 'string') addresses.push({ address: a, label: o.name || null });
      else if (a && typeof a === 'object' && !Array.isArray(a)) {
        const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean);
        if (parts.length) addresses.push({ address: parts.join(', '), label: o.name || null });
      }
      for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
    }
  });

  // geo meta tags
  const mlat = meta('meta[property="place:location:latitude"]') || meta('meta[property="og:latitude"]');
  const mlng = meta('meta[property="place:location:longitude"]') || meta('meta[property="og:longitude"]');
  if (mlat && mlng) addCoord(mlat, mlng, document.title);
  const gp = meta('meta[name="geo.position"]');
  if (gp) { const p = gp.split(/[;,]/); if (p.length === 2) addCoord(p[0], p[1], meta('meta[name="geo.placename"]') || document.title); }
  const icbm = meta('meta[name="ICBM"]');
  if (icbm) { const p = icbm.split(/[;,]/); if (p.length === 2) addCoord(p[0], p[1], document.title); }

  // .geo microformat
  document.querySelectorAll('.geo').forEach((el) => {
    const m = (el.textContent || '').match(/(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)/);
    if (m) addCoord(m[1], m[2], document.title);
  });

  // low-confidence text candidates: selection, title, geo.placename
  const sel = (window.getSelection && String(window.getSelection()).trim()) || '';
  if (sel.length >= 3 && sel.length <= 80) names.push({ name: sel });
  const title = (meta('meta[property="og:title"]') || document.title || '').replace(/\s*[|–—-]\s.*$/, '').trim();
  if (title && title.length <= 80) names.push({ name: title });
  const placename = meta('meta[name="geo.placename"]');
  if (placename) names.push({ name: placename });

  return {
    coords,
    addresses: addresses.slice(0, 5),
    names: names.slice(0, 3),
    pageTitle: document.title,
    pageUrl: location.href,
  };
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
