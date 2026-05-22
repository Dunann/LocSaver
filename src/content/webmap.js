// LocSaver — generic web-map content script (Google Maps, Apple Maps, Bing Maps).
// These maps all expose the current coordinate in the page URL, so this script
// just sends location.href to the service worker, which picks the right provider
// and extracts the coordinate. (GeoGuessr is the exception — see geoguessr-*.js.)
(function () {
  if (window.__lsvWebmapLoaded) return;
  window.__lsvWebmapLoaded = true;

  const { toast, makeFab } = window.__lsvUi;
  const fab = makeFab('Save location', onSave);

  function pageTitle() {
    return (document.title || '')
      .replace(/\s*[-–|]\s*(Google Maps|Apple Maps|Bing Maps).*$/i, '')
      .trim() || null;
  }

  async function onSave() {
    fab.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SAVE_LOCATION',
        payload: { url: location.href, label: pageTitle() },
      });
      if (!resp || !resp.ok) {
        toast(resp && resp.error === 'no-coordinates'
          ? 'Couldn’t read a coordinate here — open a place or drop a pin first.'
          : 'Save failed. Try reloading the page.', true);
      } else if (resp.duplicate) {
        toast('Already saved ✓');
      } else {
        toast('Saved ✓' + (resp.record.country ? ` · ${resp.record.country}` : ''));
      }
    } catch (err) {
      toast('Save failed: ' + ((err && err.message) || err), true);
    } finally {
      fab.disabled = false;
    }
  }
})();
