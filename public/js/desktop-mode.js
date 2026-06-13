/* ══════════════════════════════════════════════════════
   THE BOX — Desktop Mode toggle
   Force le rendu desktop sur mobile en changeant le viewport meta.
   Equivalent du "Request Desktop Website" de Safari, mais en 1 tap dans l'app.
═══════════════════════════════════════════════════════ */

const DesktopMode = (function() {
  var STORAGE_KEY = 'thebox_desktop_mode';

  function isActive() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch (_) { return false; }
  }

  function _setViewport(forceDesktop) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    if (forceDesktop) {
      // Rend la page à 1280px de large → le navigateur zoom out pour fit
      // Le user peut pinch-zoom pour voir les détails
      meta.setAttribute('content', 'width=1280, initial-scale=1, maximum-scale=5, user-scalable=yes');
    } else {
      // Mobile natif
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
    }
  }

  function _updateLabel() {
    var label = document.getElementById('desktop-mode-label');
    if (label) label.textContent = isActive() ? 'Mode Desktop' : 'Mode Desktop';
    var btn = document.getElementById('desktop-mode-btn');
    if (btn) btn.classList.toggle('active', isActive());
  }

  function init() {
    // Au chargement, applique le mode sauvegardé
    if (isActive()) _setViewport(true);
    _updateLabel();
  }

  function toggle() {
    var next = !isActive();
    try { localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false'); }
    catch (_) {}
    _setViewport(next);
    _updateLabel();
    // Feedback visuel
    if (window.Toast) {
      Toast[next ? 'success' : 'info'](next
        ? 'Mode Desktop activé — utilise le pinch pour zoomer'
        : 'Mode Mobile rétabli');
    }
  }

  function enable() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch (_) {}
    _setViewport(true);
    _updateLabel();
  }
  function disable() {
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch (_) {}
    _setViewport(false);
    _updateLabel();
  }

  // Init dès que possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { toggle, enable, disable, isActive };
})();
