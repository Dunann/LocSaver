# LocSaver

A Chrome/Edge browser extension (Manifest V3) that lets you **save a location with
one click** from **GeoGuessr** and major **web maps** — Google Maps, Apple Maps,
and Bing Maps — then review everything on one **filterable map**, organised by
country, with notes and tags.

It also **imports your existing Google saved places** from a Google Takeout export.

> See [STRATEGY.md](STRATEGY.md) for the design rationale and roadmap.

## Features

- **One-click save in GeoGuessr** — a floating *Save location* button captures the
  real coordinate of the current round (read from the page's network data, not the
  server — see [notes](#how-geoguessr-capture-works)).
- **One-click save in web maps** — Google Maps, Apple Maps, and Bing Maps; saves the
  place/pin you're viewing, parsed from the map URL. Adding another web map is a small
  `src/lib/providers.js` entry.
- **Save from Wikipedia** — on an article about a place, a Save button captures the
  article's embedded coordinate.
- **Add manually** — a dashboard form to add a location by searching a place/address
  (free, via OpenStreetMap) or by pasting coordinates.
- **Find a location on any page** — right-click → *LocSaver: find a location on this
  page*. It scrapes structured data (JSON-LD, geo meta tags, microformats) and geocodes
  place names, then asks you to confirm the best match (or tells you none was found).
- **Unified dashboard** — a Leaflet map + searchable, sortable list of everything
  you've saved. Filter by **country**, **source**, or free text; add **notes** and
  **tags**; jump to any point on the map. Map markers are colour-coded **location
  pins** by source, and clicking one shows an inline **Google Street View** preview
  of the spot (free, no API key — with an "Open in Street View" link as fallback).
- **Country organisation** — coordinates are reverse-geocoded to country/region/city
  automatically (free, keyless) so you can filter by where they are.
- **Import existing saved places** from Google Takeout (`Saved Places.json` and list
  `.csv` files).
- **Export** everything as **JSON** (backup) or **KML** (for Google My Maps).
- **Local-first & private** — all data lives in your browser (`chrome.storage.local`).
  No account, no server.

## The "Want to go" reality check

There is **no Google API to add a place to your Maps "Want to go" / saved lists** —
that's a hard limitation on Google's side, not something this extension can work
around. Instead LocSaver gives you the two things that *are* possible:

1. **Open in Google Maps** — every saved location has a deep link that opens the
   place in Google Maps, where you can tap **Save** manually.
2. **Export KML → Google My Maps** — import `locsaver.kml` into
   [Google My Maps](https://www.google.com/mymaps) for a richer, shareable map
   (layers, colours, country grouping). My Maps is a separate product from the blue-pin
   "saved lists".

LocSaver's own dashboard is the source of truth; Google is an optional export target.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder (the one containing
   `manifest.json`).
4. Pin the LocSaver icon if you like — clicking it opens the dashboard.

Requires Chrome/Edge 111+ (for `MAIN`-world content scripts).

## Usage

- **GeoGuessr** — play a round at [geoguessr.com](https://www.geoguessr.com). Once the
  panorama loads, the *Save location* button (top-right) becomes active; click it to
  save the current location. It greys out until a location is detected.
- **Web maps** — open a place or drop a pin on Google Maps, Apple Maps
  ([maps.apple.com](https://maps.apple.com)), or Bing Maps, then click *Save location*.
  The coordinate is read from the page URL, so if the view has no specific coordinate
  yet you'll be told to open a place / drop a pin first.
- **Wikipedia** — open an article about a place; if it has coordinates, the *Save
  location* button appears (top-right).
- **Add manually** — in the dashboard, click **+ Add location**, search a place or
  address (or paste `lat, lng`), then save.
- **Find on a page** — on any web page, right-click and choose **LocSaver: find a
  location on this page**. The dashboard opens with the candidates it found, for you to
  confirm. Best on pages with location metadata (businesses, events, listings); weaker
  on pure prose.
- **Dashboard** — click the toolbar icon. Search/filter, click a list item to fly to it
  on the map, edit notes/tags inline, or delete.
- **Fill countries** — if any saved point lacks a country (e.g. after an import), click
  *Fill countries* to reverse-geocode them.

### Importing from Google Takeout

1. Go to [takeout.google.com](https://takeout.google.com), deselect everything,
   select **Maps (your places)** (and/or **Saved**), and export.
2. From the download you'll get `Saved Places.json` (starred places, **with
   coordinates** — imports cleanly) and one `.csv` per named list such as
   `Want to go.csv`.
3. In the dashboard, click **Import Takeout** and select those files.

> **Heads-up:** Google exports named lists (Want to go, custom lists) as *name + Maps
> link only* — **no coordinates**. LocSaver recovers a coordinate when the link
> contains one, and lists everything it couldn't resolve so you can open and save those
> manually. Starred places (`Saved Places.json`) import fully.

## How GeoGuessr capture works

GeoGuessr is a single-page app, so the round coordinate isn't reliably in the DOM.
A `MAIN`-world script passively reads the data the page *already* fetched to render the
round — first GeoGuessr's own game API response, then the Google Street View panorama
position as a fallback — and hands the coordinate to the extension. It makes **no extra
server requests**. This is for **personal, non-competitive** use; it's heuristic and may
need updating when GeoGuessr changes its payloads.

## Privacy

All saved locations stay in `chrome.storage.local` on your machine. The only network
calls are: OpenStreetMap map tiles (dashboard), reverse geocoding to
`api.bigdatacloud.net` (primary) / `nominatim.openstreetmap.org` (fallback), and a
key-less Google Street View embed (`maps.google.com`) loaded only when you open a
pin's preview. The "find a location on this page" command reads the current page's
content **only when you invoke it** (the `activeTab` permission), and geocodes any
place names it finds via OpenStreetMap. Use **Export JSON** to back up or move your
data.

## Development

```bash
npm test            # run the unit tests (Node's built-in test runner)
npm run check       # syntax-check all source files with `node --check`
npm run gen-icons   # regenerate the PNG icons
```

The pure logic (URL/Takeout parsing, KML, geocode normalisation, the data model) lives
in `src/lib/` with no `chrome.*`/DOM dependencies, so it is unit-testable under Node.

### Layout

```
manifest.json              MV3 manifest
src/background/            service worker — the save pipeline (parse → geocode → store)
src/content/              content scripts
  geoguessr-main.js         MAIN world: captures round coords from the page's network
  geoguessr.js              isolated world: GeoGuessr Save button + messaging
  webmap.js                 isolated world: Save button for Google/Apple/Bing maps
  wikipedia.js              isolated world: Save button on Wikipedia place articles
  ui.js, locsaver.css       shared button/toast UI
src/lib/                   pure, testable modules (parse, providers, model, geocode, kml, takeout, pagescan) + storage
src/dashboard/            the review dashboard (Leaflet map + list + import/export)
src/vendor/               Leaflet (vendored; MV3 CSP forbids loading it from a CDN)
tools/                     icon generator + syntax checker
test/                     Node unit tests
```

## Known limitations

- Can't write to Google's "Want to go" / saved lists (no API) — see above.
- GeoGuessr capture is best-effort and mode-dependent; UI/payload changes upstream may
  require fixes. The button greys out if no coordinate is detected.
- Single-browser by default. Use Export/Import JSON to move data; cross-device sync is a
  future addition.
- The injected button uses a fixed position (top-right); tweak `src/content/locsaver.css`
  if it overlaps a site's controls.
