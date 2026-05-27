/* ══════════════════════════════════════════════════════
   THE BOX — Theme manager (light / dark)
══════════════════════════════════════════════════════ */

var Theme = (function() {
  var STORAGE_KEY = 'thebox_theme';

  function _apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch (_) {}
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      var label = btn.querySelector('span');
      if (label) label.textContent = (t === 'dark') ? 'Mode clair' : 'Mode sombre';
    }
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function toggle() { _apply(current() === 'dark' ? 'light' : 'dark'); }

  function init() {
    var saved;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (saved) { _apply(saved); return; }
    // Sinon : respecter la préférence système
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    _apply(prefersDark ? 'dark' : 'light');
  }

  // Init au plus tôt — avant que les styles ne se chargent
  init();

  return { toggle: toggle, current: current, init: init };
})();
