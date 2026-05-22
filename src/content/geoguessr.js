// LocSaver — GeoGuessr content script (isolated world).
// Listens for coordinates captured by the MAIN-world hook, shows the Save button,
// and forwards saves to the service worker.
(function () {
  if (window.__lsvGeoLoaded) return;
  window.__lsvGeoLoaded = true;

  const { toast, makeFab } = window.__lsvUi;
  let current = null;

  const fab = makeFab('Save location', onSave);
  refresh();

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__lsv !== true || !('loc' in e.data)) return;
    const loc = e.data.loc;
    // A null loc is a deliberate "round changed, value is stale" signal — clear it
    // so the button greys out rather than saving the previous round's location.
    current = (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) ? loc : null;
    refresh();
  });

  // Ask the page context for whatever it has already captured (covers the case
  // where this script mounts after the round's panorama has loaded).
  window.postMessage({ __lsvReq: true }, '*');

  function refresh() {
    fab.disabled = !current;
    fab.title = current
      ? `Save ${current.lat.toFixed(5)}, ${current.lng.toFixed(5)} to LocSaver`
      : 'LocSaver: waiting for the round location…';
  }

  async function onSave() {
    if (!current) return;
    fab.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SAVE_LOCATION',
        payload: {
          source: 'geoguessr',
          lat: current.lat,
          lng: current.lng,
          label: current.label || null,
          sourceUrl: location.href,
        },
      });
      if (!resp || !resp.ok) toast('Save failed.', true);
      else if (resp.duplicate) toast('Already saved ✓');
      else toast('Saved ✓' + (resp.record.country ? ` · ${resp.record.country}` : ''));
    } catch (err) {
      toast('Save failed: ' + ((err && err.message) || err), true);
    } finally {
      refresh();
    }
  }
})();
