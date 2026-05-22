// LocSaver — Google Maps content script (isolated world).
// Sends the current Maps URL to the worker, which extracts the coordinate.
(function () {
  if (window.__lsvGmapsLoaded) return;
  window.__lsvGmapsLoaded = true;

  const { toast, makeFab } = window.__lsvUi;
  const fab = makeFab('Save location', onSave);

  function pageTitle() {
    return (document.title || '').replace(/\s*[-–]\s*Google Maps\s*$/i, '').trim() || null;
  }

  async function onSave() {
    fab.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SAVE_LOCATION',
        payload: { source: 'gmaps', url: location.href, label: pageTitle() },
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
