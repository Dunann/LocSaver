// LocSaver dashboard: map + filterable list, import/export, inline editing.
import {
  getAllLocations, addLocation, addMany, updateLocation, deleteLocation, clearAll,
  getCachedGeocode, setCachedGeocode,
} from '../lib/storage.js';
import { parseTakeout } from '../lib/takeout.js';
import { toKml } from '../lib/kml.js';
import { reverseGeocode, forwardGeocode } from '../lib/geocode.js';
import { isPlaceable, gmapsLink, countryNameFromCode, SOURCE_META } from '../lib/model.js';
import { parseLatLngString } from '../lib/parse.js';

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

function markerIcon(color) {
  return L.divIcon({
    className: 'lsv-mk',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
    tooltipAnchor: [0, -8],
  });
}

// Street View: a free, key-less interactive embed + the official deep link.
function streetViewEmbed(lat, lng) {
  return `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}&cbp=11,0,0,0,0&output=svembed`;
}
function streetViewLink(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
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

function popupHtml(r) {
  const title = r.label || r.city || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
  const place = [r.city, r.region, r.country].filter(Boolean).join(', ');
  const map = gmapsLink(r);
  return `<div class="lsv-pop">
    <div class="lsv-pop-title">${esc(title)}</div>
    ${place ? `<div class="lsv-pop-place">${esc(place)}</div>` : ''}
    <iframe class="lsv-sv" loading="lazy" referrerpolicy="no-referrer" allowfullscreen
      src="${esc(streetViewEmbed(r.lat, r.lng))}"></iframe>
    <div class="lsv-pop-links">
      <a href="${esc(streetViewLink(r.lat, r.lng))}" target="_blank" rel="noreferrer">Street View ↗</a>${map ? ` · <a href="${esc(map)}" target="_blank" rel="noreferrer">Map ↗</a>` : ''}
    </div>
    <div class="lsv-pop-coords">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</div>
  </div>`;
}

function renderMarkers(rows) {
  markers.clearLayers();
  markerById.clear();
  for (const r of rows) {
    if (!isPlaceable(r)) continue;
    const m = L.marker([r.lat, r.lng], { icon: markerIcon(sourceColor(r.source)) });
    const title = r.label || r.city || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
    const place = [r.city, r.region, r.country].filter(Boolean).join(', ');
    // Hover: quick text tooltip. Click: full popup with the Street View preview
    // (loading an iframe on every hover would be far too heavy).
    m.bindTooltip(`<b>${esc(title)}</b>${place ? `<br>${esc(place)}` : ''}`, { direction: 'top' });
    m.bindPopup(() => popupHtml(r), { minWidth: 264, maxWidth: 280 });
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

// --- manual add ---
function openAddModal() {
  ['maQuery', 'maLabel', 'maLat', 'maLng', 'maNotes', 'maTags'].forEach((id) => { $(id).value = ''; });
  $('maStatus').textContent = '';
  delete $('addModal').dataset.geo;
  $('addModal').hidden = false;
  $('maQuery').focus();
}
function closeAddModal() { $('addModal').hidden = true; }

async function searchPlace() {
  const q = $('maQuery').value.trim();
  if (!q) return;
  const direct = parseLatLngString(q); // allow pasting "lat, lng" directly
  if (direct) {
    [$('maLat').value, $('maLng').value] = direct;
    $('maStatus').textContent = 'Coordinates set from input.';
    return;
  }
  $('maStatus').textContent = 'Searching…';
  const res = await forwardGeocode(q);
  if (!res) { $('maStatus').textContent = 'No match found — enter coordinates manually, or try a more specific query.'; return; }
  $('maLat').value = res.lat;
  $('maLng').value = res.lng;
  if (!$('maLabel').value.trim() && res.label) $('maLabel').value = res.label;
  $('addModal').dataset.geo = JSON.stringify(res);
  $('maStatus').textContent = `Found: ${res.displayName || res.label || `${res.lat}, ${res.lng}`}`;
}

async function addManual() {
  const lat = Number($('maLat').value);
  const lng = Number($('maLng').value);
  if (!isPlaceable({ lat, lng })) {
    $('maStatus').textContent = 'Enter a valid latitude and longitude (or search a place first).';
    return;
  }
  $('maAdd').disabled = true;
  try {
    // Reuse the search result's admin areas if it matches the entered coords.
    let geo = null;
    try {
      const s = $('addModal').dataset.geo ? JSON.parse($('addModal').dataset.geo) : null;
      if (s && Math.abs(s.lat - lat) < 1e-6 && Math.abs(s.lng - lng) < 1e-6) geo = s;
    } catch { /* ignore */ }
    if (!geo) {
      geo = (await getCachedGeocode(lat, lng)) || (await reverseGeocode(lat, lng));
      if (geo && (geo.country || geo.countryCode)) await setCachedGeocode(lat, lng, geo);
    }
    const { duplicate } = await addLocation({
      lat,
      lng,
      label: $('maLabel').value.trim() || null,
      source: 'manual',
      notes: $('maNotes').value.trim(),
      tags: $('maTags').value.split(',').map((t) => t.trim()).filter(Boolean),
      country: (geo && geo.country) || countryNameFromCode(geo && geo.countryCode) || null,
      countryCode: (geo && geo.countryCode) || null,
      region: (geo && geo.region) || null,
      city: (geo && geo.city) || null,
    });
    closeAddModal();
    await load();
    updateBadge();
    $('stats').textContent = duplicate ? 'That location was already saved.' : 'Location added.';
  } finally {
    $('maAdd').disabled = false;
  }
}

$('addManual').addEventListener('click', openAddModal);
$('addClose').addEventListener('click', closeAddModal);
$('maCancel').addEventListener('click', closeAddModal);
$('maSearch').addEventListener('click', searchPlace);
$('maQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } });
$('maAdd').addEventListener('click', addManual);
$('addModal').addEventListener('click', (e) => { if (e.target.id === 'addModal') closeAddModal(); });

// --- "find a location on this page" confirm flow (triggered from the context menu) ---
const PENDING_KEY = 'locsaver:pending';

function pageHost(p) {
  try { return new URL(p.pageUrl).hostname.replace(/^www\./, ''); } catch { return p.pageTitle || 'this page'; }
}

function showFindModal(p) {
  const card = $('findCard');
  const host = pageHost(p);
  if (!p.candidates || !p.candidates.length) {
    card.innerHTML = `<div class="modal-head">No location found <button class="link-btn" id="findClose" type="button">close</button></div>
      <p style="color:var(--muted);font-size:13px;margin:10px 0 0">Couldn't find a location on <b>${esc(host)}</b>. You can add one manually.</p>
      <div class="modal-actions"><button class="btn" id="findCancel" type="button">Close</button><button class="btn primary" id="findManual" type="button">Add manually</button></div>`;
  } else {
    const items = p.candidates.map((c, i) => {
      const place = [c.city, c.region, c.country].filter(Boolean).join(', ');
      return `<label class="cand"><input type="radio" name="cand" value="${i}"${i === 0 ? ' checked' : ''} />
        <span class="cand-main"><b>${esc(c.label || `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`)}</b>
        <span class="cand-sub">${place ? `${esc(place)} · ` : ''}<span class="coords">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span> · ${esc(c.confidence)}</span></span></label>`;
    }).join('');
    card.innerHTML = `<div class="modal-head">Save a location from ${esc(host)} <button class="link-btn" id="findClose" type="button">close</button></div>
      <div class="cand-list">${items}</div>
      <div class="modal-actions"><button class="btn" id="findCancel" type="button">None of these</button><button class="btn primary" id="findSave" type="button">Save selected</button></div>`;
  }
  $('findModal').hidden = false;

  const dismiss = async () => { $('findModal').hidden = true; await chrome.storage.local.remove(PENDING_KEY); };
  $('findClose').onclick = dismiss;
  $('findCancel').onclick = dismiss;
  const manual = $('findManual');
  if (manual) manual.onclick = async () => { await dismiss(); openAddModal(); };
  const save = $('findSave');
  if (save) {
    save.onclick = async () => {
      const picked = card.querySelector('input[name="cand"]:checked');
      const c = p.candidates[Number(picked ? picked.value : 0)];
      if (!c) return;
      save.disabled = true;
      let geo = { country: c.country, countryCode: c.countryCode, region: c.region, city: c.city };
      if (!geo.country) {
        geo = (await getCachedGeocode(c.lat, c.lng)) || (await reverseGeocode(c.lat, c.lng));
        if (geo && (geo.country || geo.countryCode)) await setCachedGeocode(c.lat, c.lng, geo);
      }
      await addLocation({
        lat: c.lat, lng: c.lng, label: c.label || null, source: 'webpage', sourceUrl: p.pageUrl,
        country: (geo && geo.country) || countryNameFromCode(geo && geo.countryCode) || null,
        countryCode: (geo && geo.countryCode) || null,
        region: (geo && geo.region) || null,
        city: (geo && geo.city) || null,
      });
      await dismiss();
      await load();
      updateBadge();
      $('stats').textContent = 'Location added from web page.';
    };
  }
}

async function checkPending() {
  const o = await chrome.storage.local.get(PENDING_KEY);
  if (o[PENDING_KEY]) showFindModal(o[PENDING_KEY]);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[PENDING_KEY] && changes[PENDING_KEY].newValue) {
    showFindModal(changes[PENDING_KEY].newValue);
  }
});

populateSourceFilter();
load();
checkPending();
