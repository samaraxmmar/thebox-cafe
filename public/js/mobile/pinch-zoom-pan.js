/* ══════════════════════════════════════════════════════
   THE BOX — Pinch-Zoom + Pan + Auto-fit
   Applique transform: scale + translate sur un élément
   pour le rendre zoomable et déplaçable au doigt.
   Spécialement conçu pour le plan de salle mobile.
═══════════════════════════════════════════════════════ */

const PinchZoomPan = (function() {

  function attach(targetEl, options) {
    if (!targetEl) return null;
    options = options || {};
    var MIN_SCALE = options.min || 0.3;
    var MAX_SCALE = options.max || 4;
    var INITIAL = options.initial || 'fit'; // 'fit' | 1 (number)

    var state = {
      scale: 1,
      tx: 0,
      ty: 0,
      // touch tracking
      startDist: 0,
      startScale: 1,
      startMidX: 0,
      startMidY: 0,
      startTx: 0,
      startTy: 0,
      mode: null,         // null | 'pan' | 'pinch'
      panStartX: 0,
      panStartY: 0,
    };

    function apply() {
      targetEl.style.transformOrigin = '0 0';
      targetEl.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
    }

    // ── Auto-fit : calcule la scale pour faire rentrer tout le contenu ──
    function fit() {
      var wrap = targetEl.parentElement;
      if (!wrap) return;
      // Reset
      state.tx = 0; state.ty = 0; state.scale = 1;
      apply();

      // Mesure la bounding box du contenu (tables actuelles)
      // On parcourt tous les enfants .table-card pour trouver les bounds en %
      var cards = targetEl.querySelectorAll('.table-card');
      if (!cards.length) { apply(); return; }

      var minX = 100, maxX = 0, minY = 100, maxY = 0;
      var floorW = targetEl.offsetWidth || 1200;
      var floorH = targetEl.offsetHeight || 800;
      cards.forEach(function(c) {
        var leftPct = parseFloat(c.style.left) || 0;
        var topPct  = parseFloat(c.style.top)  || 0;
        // Largeur table en % (utilise w stored si inline, sinon offsetWidth)
        var widthPct  = c.offsetWidth  / floorW * 100;
        var heightPct = c.offsetHeight / floorH * 100;
        minX = Math.min(minX, leftPct);
        minY = Math.min(minY, topPct);
        maxX = Math.max(maxX, leftPct + widthPct);
        maxY = Math.max(maxY, topPct + heightPct);
      });

      // Ajoute du padding autour (4% de chaque côté)
      var padX = 4, padY = 4;
      minX = Math.max(0, minX - padX);
      minY = Math.max(0, minY - padY);
      maxX = Math.min(100, maxX + padX);
      maxY = Math.min(100, maxY + padY);

      var contentWidthPx  = (maxX - minX) / 100 * floorW;
      var contentHeightPx = (maxY - minY) / 100 * floorH;
      var wrapW = wrap.clientWidth;
      var wrapH = wrap.clientHeight;

      if (contentWidthPx <= 0 || contentHeightPx <= 0) { apply(); return; }

      // Scale pour fit dans le wrap (min de horizontal et vertical pour cadrer)
      var scaleX = wrapW / contentWidthPx;
      var scaleY = wrapH / contentHeightPx;
      var fitScale = Math.min(scaleX, scaleY, MAX_SCALE);
      // Garde un min raisonnable
      fitScale = Math.max(MIN_SCALE, fitScale);

      state.scale = fitScale;
      // Translate pour centrer le contenu dans le wrap
      var contentLeftPx = minX / 100 * floorW;
      var contentTopPx  = minY / 100 * floorH;
      state.tx = (wrapW - contentWidthPx * fitScale) / 2 - contentLeftPx * fitScale;
      state.ty = (wrapH - contentHeightPx * fitScale) / 2 - contentTopPx * fitScale;
      apply();
    }

    // ── Pinch helpers ──
    function _dist(t1, t2) {
      var dx = t2.clientX - t1.clientX;
      var dy = t2.clientY - t1.clientY;
      return Math.hypot(dx, dy);
    }
    function _mid(t1, t2) {
      return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    }

    // ── Touch handlers ──
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        state.mode = 'pinch';
        var t1 = e.touches[0], t2 = e.touches[1];
        state.startDist = _dist(t1, t2);
        state.startScale = state.scale;
        var m = _mid(t1, t2);
        state.startMidX = m.x;
        state.startMidY = m.y;
        state.startTx = state.tx;
        state.startTy = state.ty;
      } else if (e.touches.length === 1) {
        state.mode = 'pan';
        state.panStartX = e.touches[0].clientX;
        state.panStartY = e.touches[0].clientY;
        state.startTx = state.tx;
        state.startTy = state.ty;
      }
    }
    function onTouchMove(e) {
      if (state.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        var t1 = e.touches[0], t2 = e.touches[1];
        var dist = _dist(t1, t2);
        var newScale = state.startScale * (dist / state.startDist);
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        // Zoom centré sur le midpoint des doigts
        var m = _mid(t1, t2);
        var wrap = targetEl.parentElement;
        var wrapRect = wrap.getBoundingClientRect();
        var midInWrapX = m.x - wrapRect.left;
        var midInWrapY = m.y - wrapRect.top;
        var scaleDelta = newScale / state.startScale;
        // Ajuste tx/ty pour garder le midpoint à sa position
        state.tx = midInWrapX - (midInWrapX - state.startTx) * scaleDelta;
        state.ty = midInWrapY - (midInWrapY - state.startTy) * scaleDelta;
        state.scale = newScale;
        apply();
      } else if (state.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        var dx = e.touches[0].clientX - state.panStartX;
        var dy = e.touches[0].clientY - state.panStartY;
        state.tx = state.startTx + dx;
        state.ty = state.startTy + dy;
        apply();
      }
    }
    function onTouchEnd(e) {
      if (e.touches.length === 0) state.mode = null;
      else if (e.touches.length === 1) {
        // Passe de pinch à pan
        state.mode = 'pan';
        state.panStartX = e.touches[0].clientX;
        state.panStartY = e.touches[0].clientY;
        state.startTx = state.tx;
        state.startTy = state.ty;
      }
    }

    targetEl.addEventListener('touchstart', onTouchStart, { passive: true });
    targetEl.addEventListener('touchmove',  onTouchMove,  { passive: false });
    targetEl.addEventListener('touchend',   onTouchEnd,   { passive: true });
    targetEl.addEventListener('touchcancel',onTouchEnd,   { passive: true });

    // Initial fit après que le DOM soit calé
    if (INITIAL === 'fit') {
      setTimeout(fit, 50);
    } else {
      state.scale = Number(INITIAL) || 1;
      apply();
    }

    return {
      fit: fit,
      reset: fit,
      setScale: function(s) { state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); apply(); },
      getState: function() { return { scale: state.scale, tx: state.tx, ty: state.ty }; },
      destroy: function() {
        targetEl.removeEventListener('touchstart', onTouchStart);
        targetEl.removeEventListener('touchmove',  onTouchMove);
        targetEl.removeEventListener('touchend',   onTouchEnd);
        targetEl.removeEventListener('touchcancel',onTouchEnd);
        targetEl.style.transform = '';
      },
    };
  }

  return { attach };
})();
