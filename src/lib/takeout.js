// Parse Google Takeout "Saved" exports into LocSaver records.
//   - Starred places  -> GeoJSON with real coordinates (clean import).
//   - Named lists      -> CSV with only a Title + Maps URL (best-effort import:
//     coordinates are recovered from the URL when present, otherwise the entry
//     is reported as unresolved for the user to add manually).
import { parseGmapsUrl, isValidLatLng } from './parse.js';
import { makeRecord, countryNameFromCode } from './model.js';

/** Parse the GeoJSON "Saved Places.json" export (starred places). */
export function parseGeoJson(text) {
  const data = JSON.parse(text);
  const feats = Array.isArray(data.features) ? data.features : [];
  const records = [];
  const unresolved = [];

  for (const f of feats) {
    const props = f.properties || {};
    const loc = props.location || props.Location || {};
    const label = props.Title || props.title || loc.name || props.name || null;
    const url = props.google_maps_url || props.Url || props.URL || null;
    const code = loc.country_code || loc.countryCode || null;
    const coords = f.geometry && f.geometry.coordinates; // [lng, lat]

    let lat = null;
    let lng = null;
    if (Array.isArray(coords) && coords.length >= 2) {
      lng = Number(coords[0]);
      lat = Number(coords[1]);
    }
    if (!isValidLatLng(lat, lng)) {
      const fromUrl = url ? parseGmapsUrl(url) : null;
      if (fromUrl && isValidLatLng(fromUrl.lat, fromUrl.lng)) {
        lat = fromUrl.lat;
        lng = fromUrl.lng;
      }
    }

    if (isValidLatLng(lat, lng)) {
      records.push(makeRecord({
        lat, lng, label, source: 'takeout', sourceUrl: url,
        countryCode: code,
        country: countryNameFromCode(code),
      }));
    } else {
      unresolved.push({ title: label || '(unnamed)', url: url || null });
    }
  }
  return { records, unresolved };
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse a named-list CSV export ("Want to go.csv", custom lists, etc.). */
export function parseListCsv(text) {
  const rows = parseCsv(text).filter((r) => r.length && r.some((c) => c.trim() !== ''));
  if (!rows.length) return { records: [], unresolved: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idxTitle = header.findIndex((h) => h === 'title' || h === 'name');
  const idxUrl = header.findIndex((h) => h === 'url' || h === 'link');
  const idxNote = header.findIndex((h) => h === 'note' || h === 'comment' || h === 'notes');

  const records = [];
  const unresolved = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = idxTitle >= 0 ? (r[idxTitle] || '').trim() : '';
    const url = idxUrl >= 0 ? (r[idxUrl] || '').trim() : '';
    const note = idxNote >= 0 ? (r[idxNote] || '').trim() : '';
    const parsed = url ? parseGmapsUrl(url) : null;
    if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
      records.push(makeRecord({
        lat: parsed.lat, lng: parsed.lng,
        label: title || parsed.label, notes: note,
        source: 'takeout', sourceUrl: url,
      }));
    } else {
      unresolved.push({ title: title || '(unnamed)', url: url || null });
    }
  }
  return { records, unresolved };
}

/** Dispatch by filename / content sniffing. */
export function parseTakeout(filename, text) {
  const clean = String(text || '').replace(/^﻿/, '');
  const name = (filename || '').toLowerCase();
  const trimmed = clean.trimStart();
  if (name.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseGeoJson(clean);
  }
  return parseListCsv(clean);
}
