/* ══════════════════════════════════════════════════════
   THE BOX — Mobile Detect
   Détecte les vrais smartphones (≤768px de largeur OU user-agent mobile)
   Bascule en mode mobile : on charge les modules dédiés et on override
   les fonctions desktop par leurs équivalents mobile.
═══════════════════════════════════════════════════════ */

const MobileDetect = (function() {
  const MOBILE_BREAKPOINT = 768;

  function isMobile() {
    // 1) Largeur viewport
    if (window.innerWidth <= MOBILE_BREAKPOINT) return true;
    // 2) User-Agent (fallback pour tablette en mode paysage)
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    return false;
  }

  function isTabletPortrait() {
    return window.innerWidth > MOBILE_BREAKPOINT && window.innerWidth <= 1024;
  }

  // Détection vraie tablette (iPad récents masquent leur UA en desktop)
  function isTouch() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  function activate() {
    document.documentElement.classList.add('is-mobile');
    document.documentElement.classList.toggle('is-touch', isTouch());
    if (isTabletPortrait()) document.documentElement.classList.add('is-tablet-portrait');
  }

  // Watch resize : active/désactive quand l'orientation change (tablette)
  let _lastIsMobile = null;
  function _watchResize() {
    const cur = isMobile();
    if (cur !== _lastIsMobile) {
      _lastIsMobile = cur;
      document.documentElement.classList.toggle('is-mobile', cur);
      if (window.TablesMobile && window.Tables && window.Tables.render) {
        // Re-render pour adopter la nouvelle vue
        try { window.Tables.render(); } catch (_) {}
      }
    }
  }
  window.addEventListener('resize', _debounce(_watchResize, 200));

  function _debounce(fn, ms) {
    let t;
    return function() {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  return { isMobile, isTabletPortrait, isTouch, activate };
})();

// Active immédiatement si mobile détecté
if (MobileDetect.isMobile()) MobileDetect.activate();
