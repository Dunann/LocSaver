// Shared UI helpers for LocSaver content scripts (isolated world).
// Loaded before each site script; exposes a floating button + toast on window.
// (Content scripts injected into the same document share this isolated global.)
(function () {
  if (window.__lsvUi) return;

  const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';

  function toast(text, isError) {
    let t = document.querySelector('.lsv-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'lsv-toast';
      (document.body || document.documentElement).appendChild(t);
    }
    t.textContent = text;
    t.classList.toggle('lsv-error', !!isError);
    requestAnimationFrame(() => t.classList.add('lsv-show'));
    clearTimeout(t.__lsvTimer);
    t.__lsvTimer = setTimeout(() => t.classList.remove('lsv-show'), 2800);
  }

  // Create a floating action button and keep it mounted across SPA re-renders.
  function makeFab(label, onClick) {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'lsv-fab lsv-top-right';
    fab.innerHTML = PIN + '<span>' + label + '</span>';
    fab.addEventListener('click', onClick);

    const mount = () => {
      if (document.body && !document.body.contains(fab)) document.body.appendChild(fab);
    };
    const start = () => {
      mount();
      if (document.body) new MutationObserver(mount).observe(document.body, { childList: true });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
    return fab;
  }

  window.__lsvUi = { toast, makeFab };
})();
