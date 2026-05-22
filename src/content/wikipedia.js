// LocSaver — Wikipedia content script (isolated world).
// Articles about a place embed a machine-readable coordinate in the page (the
// `.geo` microformat, e.g. "48.8584; 2.2945"). When one is present, offer to
// save it; on other articles we stay out of the way (no button).
(function () {
  if (window.__lsvWikiLoaded) return;
  window.__lsvWikiLoaded = true;

  const { toast, makeFab } = window.__lsvUi;

  function readCoords() {
    const geo = document.querySelector('.geo'); // decimal "lat; lon"
    if (!geo) return null;
    const m = (geo.textContent || '').match(/(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function articleTitle() {
    const h = document.querySelector('#firstHeading');
    const t = h ? h.textContent : document.title.replace(/\s*[-–]\s*Wikipedia.*$/i, '');
    return (t || '').trim() || null;
  }

  const coords = readCoords();
  if (!coords) return; // article has no location — don't add a button

  const fab = makeFab('Save location', onSave);
  fab.title = `Save ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (${articleTitle()}) to LocSaver`;

  async function onSave() {
    fab.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SAVE_LOCATION',
        payload: {
          source: 'wikipedia',
          lat: coords.lat,
          lng: coords.lng,
          label: articleTitle(),
          sourceUrl: location.href,
        },
      });
      if (!resp || !resp.ok) toast('Save failed.', true);
      else if (resp.duplicate) toast('Already saved ✓');
      else toast('Saved ✓' + (resp.record.country ? ` · ${resp.record.country}` : ''));
    } catch (err) {
      toast('Save failed: ' + ((err && err.message) || err), true);
    } finally {
      fab.disabled = false;
    }
  }
})();
