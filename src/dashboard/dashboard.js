// LocSaver dashboard: map + filterable list, import/export, inline editing.
import {
  getAllLocations, addMany, updateLocation, deleteLocation, clearAll,
  getCachedGeocode, setCachedGeocode,
} from '../lib/storage.js';
import { parseTakeout } from '../lib/takeout.js';
import { toKml } from '../lib/kml.js';
import { reverseGeocode } from '../lib/geocode.js';
import { isPlaceable, gmapsLink, countryNameFromCode, SOURCE_META } from '../lib/model.js';

const L = window.L;
const sourceColor = (s) => (SOURCE_META[s] && SOURCE_META[s].color) || '#0e7c66';
const sourceLabel = (s) => (SOURCE_META[s] && SOURCE_META[s].label) || s;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let all = [];
const markerById = new Map();

// --- map ---
const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);
const markers = L.layerGroup().addTo(map);

function markerIcon(source) {
  const color = sourceColor(source);
  return L.divIcon({
    className: 'lsv-mk',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

// --- data load + render ---
async function load() {
  all = await getAllLocations();
  render();
}

function activeFilters() {
  return {
    q: $('search').value.trim().toLowerCase(),
    country: $('countryFilter').value,
    source: $('sourceFilter').value,
    sort: $('sortBy').value,
  };
}

function applyFilters() {
  const f = activeFilters();
  let rows = all.filter((r) => {
    if (f.source && r.source !== f.source) return false;
    if (f.country === '__none__' && r.country) return false;
    if (f.country && f.country !== '__none__' && r.country !== f.country) return false;
    if (f.q) {
      const hay = [r.label, r.city, r.region, r.country, r.notes, (r.tags || []).join(' ')]
        .join(' ').toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    if (f.sort === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '');
    if (f.sort === 'country') {
      return (a.country || '~').localeCompare(b.country || '~')
        || (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    return (b.createdAt || '').localeCompare(a.createdAt || ''); // newest
  });
  return rows;
}

function render() {
  const rows = applyFilters();
  renderStats(rows.length);
  renderCountryOptions();
  renderList(rows);
  renderMarkers(rows);
}

function renderStats(shown) {
  const countries = new Set(all.filter((r) => r.country).map((r) => r.country));
  $('stats').textContent =
    `${all.length} saved · ${countries.size} countries · showing ${shown}`;
}

function renderCountryOptions() {
  const sel = $('countryFilter');
  const prev = sel.value;
  const countries = [...new Set(all.filter((r) => r.country).map((r) => r.country))].sort();
  const hasUnknown = all.some((r) => !r.country);
  let html = '<option value="">All countries</option>';
  if (hasUnknown) html += '<option value="__none__">(Unknown)</option>';
  html += countries.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.innerHTML = html;
  sel.value = prev;
  if (sel.value !== prev) sel.value = ''; // selected country no longer present
}

function renderList(rows) {
  const list = $('list');
  if (!rows.length) {
    list.innerHTML = '<div class="empty">No locations match. Save some from GeoGuessr, Google Maps, Apple Maps, or Bing — or import a Takeout file.</div>';
    return;
  }
  list.innerHTML = rows.map(cardHtml).join('');
}

function cardHtml(r) {
  const title = r.label || r.city || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
  const place = [r.city, r.region, r.country].filter(Boolean).join(', ') || 'Location unknown';
  const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
  const link = gmapsLink(r);
  return `<article class="card" data-id="${esc(r.id)}">
    <div class="card-head">
      <span class="card-title" data-act="focus">${esc(title)}</span>
      <span class="badge" style="background:${sourceColor(r.source)}">${esc(sourceLabel(r.source))}</span>
    </div>
    <div class="card-meta">${esc(place)}</div>
    <div class="card-meta">
      <span class="coords">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</span>
      ${date ? ` · ${esc(date)}` : ''}
      ${link ? ` · <a href="${esc(link)}" target="_blank" rel="noreferrer">Open in Maps ↗</a>` : ''}
    </div>
    <textarea data-act="notes" placeholder="Notes…">${esc(r.notes || '')}</textarea>
    <input class="tags-input" data-act="tags" placeholder="tags, comma, separated" value="${esc((r.tags || []).join(', '))}" />
    <div class="card-actions"><button class="link-btn" data-act="delete">Delete</button></div>
  </article>`;
}

function renderMarkers(rows) {
  markers.clearLayers();
  markerById.clear();
  for (const r of rows) {
    if (!isPlaceable(r)) continue;
    const m = L.marker([r.lat, r.lng], { icon: markerIcon(r.source) });
    const title = r.label || r.city || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
    const place = [r.city, r.region, r.country].filter(Boolean).join(', ');
    const link = gmapsLink(r);
    m.bindPopup(
      `<b>${esc(title)}</b><br>${esc(place)}<br>` +
      `<span style="font-family:monospace">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</span>` +
      (link ? `<br><a href="${esc(link)}" target="_blank" rel="noreferrer">Open in Google Maps ↗</a>` : ''),
    );
    m.addTo(markers);
    markerById.set(r.id, m);
  }
}

function focusLocation(id) {
  const r = all.find((x) => x.id === id);
  const m = markerById.get(id);
  if (!r || !m) return;
  map.setView([r.lat, r.lng], Math.max(map.getZoom(), 6));
  m.openPopup();
}

// --- list interactions (event delegation) ---
$('list').addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'focus') focusLocation(id);
  else if (act === 'delete') {
    await deleteLocation(id);
    all = all.filter((r) => r.id !== id);
    render();
    updateBadge();
  }
});

$('list').addEventListener('change', async (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  const act = e.target.dataset.act;
  const rec = all.find((r) => r.id === id);
  if (!rec) return;
  if (act === 'notes') {
    rec.notes = e.target.value;
    await updateLocation(id, { notes: rec.notes });
  } else if (act === 'tags') {
    rec.tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
    await updateLocation(id, { tags: rec.tags });
  }
});

// --- filters ---
['search', 'countryFilter', 'sourceFilter', 'sortBy'].forEach((id) => {
  $(id).addEventListener('input', render);
});

// --- import / export ---
$('importFile').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  let added = 0;
  let skipped = 0;
  const unresolved = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const parsed = parseTakeout(file.name, text);
      const res = await addMany(parsed.records);
      added += res.added;
      skipped += res.skipped;
      unresolved.push(...parsed.unresolved);
    } catch (err) {
      unresolved.push({ title: `Could not parse ${file.name}: ${err.message}`, url: null });
    }
  }
  await load();
  updateBadge();
  showImportReport(added, skipped, unresolved);
});

$('exportJson').addEventListener('click', () => {
  download('locsaver-export.json', JSON.stringify(all, null, 2), 'application/json');
});

$('exportKml').addEventListener('click', () => {
  download('locsaver.kml', toKml(all), 'application/vnd.google-earth.kml+xml');
});

$('clearAll').addEventListener('click', async () => {
  if (!all.length) return;
  if (!confirm(`Delete all ${all.length} saved locations? This cannot be undone.`)) return;
  await clearAll();
  all = [];
  render();
  updateBadge();
});

// --- fill missing countries via reverse geocoding (throttled, cached) ---
$('fillCountries').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const targets = all.filter((r) => isPlaceable(r) && !r.country);
  if (!targets.length) { $('stats').textContent = 'All locations already have a country.'; return; }
  btn.disabled = true;
  let done = 0;
  for (const r of targets) {
    let geo = await getCachedGeocode(r.lat, r.lng);
    if (!geo) {
      geo = await reverseGeocode(r.lat, r.lng);
      if (geo && (geo.country || geo.countryCode)) await setCachedGeocode(r.lat, r.lng, geo);
    }
    const patch = {
      country: (geo && geo.country) || countryNameFromCode(geo && geo.countryCode) || null,
      countryCode: (geo && geo.countryCode) || null,
      region: (geo && geo.region) || null,
      city: (geo && geo.city) || null,
    };
    await updateLocation(r.id, patch);
    Object.assign(r, patch);
    done++;
    $('stats').textContent = `Filling countries… ${done}/${targets.length}`;
    if (done % 5 === 0) render();
    await sleep(200);
  }
  render();
  btn.disabled = false;
});

// --- helpers ---
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showImportReport(added, skipped, unresolved) {
  const box = $('importReport');
  const items = unresolved.slice(0, 50).map((u) => {
    const link = u.url ? ` — <a href="${esc(u.url)}" target="_blank" rel="noreferrer">link ↗</a>` : '';
    return `<li>${esc(u.title)}${link}</li>`;
  }).join('');
  box.innerHTML =
    `<button class="link-btn close" id="closeReport">close</button>` +
    `<h3>Import complete</h3>` +
    `<div>Added <b>${added}</b> · skipped ${skipped} duplicate(s)` +
    (unresolved.length ? ` · <b>${unresolved.length}</b> couldn’t be resolved</b>` : '') +
    `</div>` +
    (unresolved.length
      ? `<p style="color:var(--muted);font-size:12px;margin:8px 0 0">These list entries had no usable coordinate (Google exports named lists as name + link only). Open each link and use the Save button, or add them manually:</p><ul>${items}</ul>`
      : '');
  box.hidden = false;
  $('closeReport').addEventListener('click', () => { box.hidden = true; });
}

function updateBadge() {
  try { chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }); } catch { /* ignore */ }
}

// Build the source filter from the registry so new providers appear automatically.
function populateSourceFilter() {
  $('sourceFilter').innerHTML = '<option value="">All sources</option>'
    + Object.entries(SOURCE_META)
      .map(([id, m]) => `<option value="${id}">${esc(m.label)}</option>`)
      .join('');
}

populateSourceFilter();
load();
