// LocSaver — GeoGuessr capture, MAIN world (runs in the page's own JS context).
//
// Getting the round's REAL coordinate reliably is the whole game here. GeoGuessr is
// a Next.js SPA, so the coordinate isn't sitting in the DOM. We capture it from the
// thing that is always correct and always current: the Google Street View panorama
// that GeoGuessr renders. We hook the Maps JS API so we read the exact on-screen
// position, and it updates the instant a new round's pano loads (no polling, no
// stale value carried over from the previous round).
//
// Layers, most-trusted last (latest valid value wins):
//   1. StreetViewService.getPanorama  — pano metadata fetch (prototype: all instances)
//   2. StreetViewPanorama.setPosition — programmatic position set (prototype)
//   3. StreetViewPanorama position_changed — live position incl. user movement
//   4. GeoGuessr game API — map name + a strict fallback coordinate, AND the signal
//      we use to detect a round change and clear any stale value.
//
// This only reads data the page already has; it makes no server requests of its own.
// Heuristic + best-effort: enable logging with localStorage.setItem('lsvDebug','1').
(function () {
  if (window.__lsvMainLoaded) return;
  window.__lsvMainLoaded = true;

  const DEBUG = (() => { try { return !!localStorage.getItem('lsvDebug'); } catch { return false; } })();
  const log = (...a) => { if (DEBUG) console.log('%c[LocSaver]', 'color:#0e7c66', ...a); };

  let current = null;   // { lat, lng, label, source }
  let mapLabel = null;  // map name from the game API, for nicer labels
  let roundKey = null;  // token#round, to detect round changes

  function valid(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  }

  // Accepts a google.maps.LatLng (lat()/lng() methods) or a {lat,lng} literal.
  function llToPair(ll) {
    if (!ll) return null;
    const lat = typeof ll.lat === 'function' ? ll.lat() : ll.lat;
    const lng = typeof ll.lng === 'function' ? ll.lng() : ll.lng;
    return [Number(lat), Number(lng)];
  }

  function emit(loc) { window.postMessage({ __lsv: true, loc }, '*'); }

  function setCurrent(lat, lng, source) {
    if (!valid(lat, lng)) return;
    if (current && current.lat === lat && current.lng === lng) return;
    current = { lat, lng, label: mapLabel, source };
    log('captured', source, '→', lat, lng);
    emit(current);
  }

  function clearCurrent(why) {
    if (current === null) return;
    current = null;
    log('cleared (', why, ')');
    emit(null); // tell the button to grey out until the new round is captured
  }

  // ---------- Primary: hook the Google Maps Street View API ----------
  function hookMaps(maps) {
    if (!maps || maps.__lsvHooked) return;
    maps.__lsvHooked = true;
    log('hooking google.maps Street View');

    // (1) StreetViewService.getPanorama — patched on the prototype so it applies to
    // every instance, even any created before we ran.
    try {
      const proto = maps.StreetViewService && maps.StreetViewService.prototype;
      if (proto && proto.getPanorama && !proto.getPanorama.__lsv) {
        const orig = proto.getPanorama;
        const grab = (data) => {
          try {
            const pr = llToPair(data && data.location && data.location.latLng);
            if (pr) setCurrent(pr[0], pr[1], 'getPanorama');
          } catch { /* ignore */ }
        };
        proto.getPanorama = function (request, callback) {
          if (typeof callback === 'function') {
            return orig.call(this, request, (data, status) => { grab(data); return callback(data, status); });
          }
          const ret = orig.call(this, request);
          if (ret && typeof ret.then === 'function') ret.then(grab).catch(() => {});
          return ret;
        };
        proto.getPanorama.__lsv = true;
      }
    } catch (e) { log('getPanorama hook failed', e); }

    // (2) StreetViewPanorama.setPosition (prototype) + (3) position_changed listener.
    try {
      const Orig = maps.StreetViewPanorama;
      if (Orig && Orig.prototype) {
        const sp = Orig.prototype.setPosition;
        if (sp && !sp.__lsv) {
          Orig.prototype.setPosition = function (latLng, ...rest) {
            try { const pr = llToPair(latLng); if (pr) setCurrent(pr[0], pr[1], 'setPosition'); } catch { /* ignore */ }
            return sp.call(this, latLng, ...rest);
          };
          Orig.prototype.setPosition.__lsv = true;
        }
        if (!Orig.__lsv) {
          const Patched = function (...args) {
            const inst = new Orig(...args);
            try {
              if (inst.addListener) {
                inst.addListener('position_changed', () => {
                  try { const pr = llToPair(inst.getPosition && inst.getPosition()); if (pr) setCurrent(pr[0], pr[1], 'position_changed'); } catch { /* ignore */ }
                });
              }
            } catch { /* ignore */ }
            return inst;
          };
          Patched.prototype = Orig.prototype;
          try { Object.setPrototypeOf(Patched, Orig); } catch { /* ignore */ }
          try { Object.assign(Patched, Orig); } catch { /* ignore */ }
          Patched.__lsv = true;
          try { maps.StreetViewPanorama = Patched; } catch (e) { log('could not replace constructor', e); }
        }
      }
    } catch (e) { log('panorama hook failed', e); }
  }

  // Wait for the Maps API to load, then hook it (poll fast, give up after ~30 s).
  let tries = 0;
  const mapsTimer = setInterval(() => {
    tries += 1;
    const maps = window.google && window.google.maps;
    if (maps && (maps.StreetViewPanorama || maps.StreetViewService)) {
      hookMaps(maps);
      clearInterval(mapsTimer);
    } else if (tries > 300) {
      clearInterval(mapsTimer);
      log('gave up waiting for google.maps');
    }
  }, 100);

  // ---------- Secondary: GeoGuessr game API (label + round-change signal + fallback) ----------
  const RELEVANT = /\/api\/v[34]\/(games|challenges|live-challenge|lobby)/i;

  function handleGame(text) {
    let data;
    try { data = JSON.parse(text); } catch { return; }
    const game = (data && (data.game || data)) || {};

    if (game.mapName) mapLabel = game.mapName;
    else if (game.map && game.map.name) mapLabel = game.map.name;

    // Detect a round change and drop any stale coordinate immediately.
    const key = `${game.token || game.gameToken || ''}#${game.round != null ? game.round : ''}`;
    if (key !== '#' && key !== roundKey) {
      roundKey = key;
      clearCurrent('round-change');
    }

    // Strict fallback: exactly the current round's entry (no off-by-one guessing).
    const rounds = game.rounds;
    if (Array.isArray(rounds) && Number.isInteger(game.round)) {
      const pr = llToPair(rounds[game.round - 1]);
      if (pr && valid(pr[0], pr[1])) setCurrent(pr[0], pr[1], 'gameApi');
    }
  }

  // --- hook fetch ---
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const req = args[0];
      const url = typeof req === 'string' ? req : (req && req.url) || '';
      const p = origFetch.apply(this, args);
      if (RELEVANT.test(url)) {
        p.then((resp) => { resp.clone().text().then(handleGame).catch(() => {}); }).catch(() => {});
      }
      return p;
    };
  }

  // --- hook XHR ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lsvUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (RELEVANT.test(this.__lsvUrl || '')) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') handleGame(this.responseText);
        } catch { /* ignore */ }
      });
    }
    return origSend.apply(this, args);
  };

  // --- __NEXT_DATA__ on first load (covers the first round of a fresh page load) ---
  try {
    const el = document.getElementById('__NEXT_DATA__');
    if (el) {
      const game = JSON.parse(el.textContent).props?.pageProps?.game;
      if (game) handleGame(JSON.stringify(game));
    }
  } catch { /* ignore */ }

  // Replay the current value when the isolated content script asks (e.g. on mount).
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__lsvReq !== true) return;
    emit(current);
  });
})();
