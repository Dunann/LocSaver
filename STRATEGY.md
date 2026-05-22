# LocSaver — Implementation Strategy

## Context

You play GeoGuessr and browse Google Maps, and want a frictionless way to **save
interesting locations with one click** and **review/organize them all in one place**
(filter by country, add notes, etc.).

This need isn't met by what exists today:
- **GeoGuessr Collections** (official) can save round locations but is capped
  (~20 collections × 200 locations), lives only inside GeoGuessr, and has no
  cross-site view or country filtering.
- **Google Maps saved lists** can't be filtered well, can't be queried by an API,
  and — critically — **can't be written to programmatically** (see hard constraint).
- **Pin Drop** (existing extension) saves web places to a map but is *not*
  GeoGuessr-aware, so it can't capture the hidden round coordinates.

The distinctive value here is **capturing the real GeoGuessr round location** and
unifying it with Google Maps places in one filterable dashboard.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Form factor | **Manifest V3 browser extension** (Chrome/Edge) |
| v1 scope | GeoGuessr capture **+** Google Maps capture **+** one-time Google Takeout import |
| Storage | **Local-first**: `chrome.storage.local` (+ `unlimitedStorage`), JSON export/import. Cross-device sync deferred. |

## Feasibility summary

| Capability | Verdict | How |
|---|---|---|
| One-click save in GeoGuessr | ✅ Solid | Read real lat/lng from page's `__NEXT_DATA__` JSON (present *during* a round); fallback = intercept Street View metadata request |
| One-click save in Google Maps | ✅ Solid | Parse `@lat,lng` from the Maps URL |
| Review all in one place | ✅ Solid | Extension dashboard page (list + Leaflet map) |
| Filter/organize by country | ✅ Solid | Reverse-geocode each coord → country |
| Import existing Google saved places | ⚠️ Partial | Starred = clean (GeoJSON); named lists = best-effort (see caveat) |
| Auto-add to Google "Want to go" | ❌ Not possible | No API. Deep-link (manual save) or KML→My Maps only |

## Hard constraint: Google "Want to go"

There is **no public Google API to write to saved lists** ("Want to go", Favorites,
Starred, custom). Confirmed, long-standing gap. Workarounds:
1. **Per-pin deep link** — `https://www.google.com/maps/search/?api=1&query=LAT,LNG`
   opens the place so you can tap Save manually (one click).
2. **KML export → Google My Maps** — export the whole collection and import into
   [My Maps](https://www.google.com/mymaps) (separate, more capable product:
   layers, colors, country grouping, sharing). Not the same as in-app saved lists.

**Design implication:** the extension's own dashboard is the source of truth; Google
is an optional *export* target, never the backend.

## Architecture (MV3)

- **Content script — geoguessr.com**: injects a "Save" button; reads coords from
  `__NEXT_DATA__` (fallback: passive network intercept of the Street View metadata
  RPC). `MutationObserver` to survive React re-renders / SPA navigation.
- **Content script — google.com/maps**: injects a "Save" button; reads coords from
  the URL (`@lat,lng` or `?q=` / `ll=`), plus the place name when present.
- **Service worker**: receives save events, reverse-geocodes coord → country,
  writes the record to storage.
- **Storage module**: `chrome.storage.local` + `unlimitedStorage` (thousands of
  ~0.5 KB records is trivial). JSON export/import for backup & portability.
- **Dashboard page** (`options_ui` / full page): [Leaflet](https://leafletjs.com)
  + free OpenStreetMap tiles; sortable/filterable list (country, source, date, tags)
  + text search; per-pin "Open in Google Maps" deep link.
- **Reverse geocoding**: BigDataCloud (free, client-side, no key) primary;
  OSM Nominatim fallback (1 req/sec, requires User-Agent). Cache by rounded coord
  to avoid repeat lookups. No paid Google key needed.

## Data model (one saved location)

```
{
  id, lat, lng,
  label,            // place/round name if available
  country, countryCode, region, city,   // from reverse geocoding
  source,           // 'geoguessr' | 'gmaps' | 'takeout'
  sourceUrl,        // original GeoGuessr game / Maps URL
  notes, tags[],
  createdAt
}
```

## Build order (v1)

1. **Scaffold** — manifest.json (MV3), service worker, dashboard page, storage module.
2. **GeoGuessr capture** — content script, `__NEXT_DATA__` reader, Save button,
   `MutationObserver`.
3. **Storage + minimal dashboard** — persist records; show them in a list.
4. **Organize** — reverse-geocode → country; Leaflet map; filters
   (country/source/date) + search; notes + tags.
5. **Google Maps capture** — content script, URL parser, Save button.
6. **Takeout import** — file upload; parse `Saved Places.json` (GeoJSON) cleanly;
   parse list CSVs best-effort; flag unresolved entries for manual review.
7. **Export** — JSON (full backup), KML (for My Maps); per-pin Google Maps deep link.

## Takeout import caveat

- **Starred places** export as GeoJSON with real coordinates → clean import.
- **Named lists** ("Want to go", custom) export as CSV with only **name + Google
  Maps URL — no coordinates or place IDs**. These must be resolved via URL parsing
  or geocode-by-name; some will fail. Import them best-effort and surface a
  "couldn't resolve" list for the user.

## Risks to respect

- **GeoGuessr ToS** — personal, non-competitive use only; don't hammer their
  servers; prefer passive `__NEXT_DATA__` / network reads. Avoid the old
  React-state-poking trick (can trigger account restrictions).
- **Brittle selectors** — GeoGuessr's hashed CSS class names change; anchor button
  injection with `MutationObserver` + resilient hooks, expect occasional breakage.
- **Maintenance** — GeoGuessr/Google Maps UI updates may require fixes over time.

## Verification (end-to-end)

1. Load the unpacked extension in Chrome/Edge (`chrome://extensions` → Developer
   mode → Load unpacked).
2. Play a GeoGuessr round, click **Save** → confirm a record with correct coords
   appears in the dashboard.
3. On Google Maps, open a place, click **Save** → confirm coords parsed from URL.
4. Import a Google Takeout export → confirm starred places import with coords;
   review the unresolved-list-entries report.
5. Filter by country → confirm both the list and the map update.
6. Export JSON and KML; import the KML into Google My Maps to confirm it loads.

## Deferred (post-v1)

- Cross-device sync (e.g. Supabase with a `chrome.storage` adapter + login).
- Firefox/Safari ports.
- Richer organization (collections/folders, bulk tagging, dedupe).
