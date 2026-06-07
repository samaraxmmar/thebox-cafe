/* ══════════════════════════════════════════════════════
   THE BOX — Gestures (mobile only)
   Helpers pour swipe horizontal, long-press, pinch-zoom.
═══════════════════════════════════════════════════════ */

const Gestures = (function() {

  // ── Swipe horizontal sur une card ────────────────────────
  function attachSwipe(elements, opts = {}) {
    const onLeft  = opts.onSwipeLeft  || (() => {});
    const onRight = opts.onSwipeRight || (() => {});
    const THRESHOLD = opts.threshold || 60;

    const list = elements instanceof NodeList ? Array.from(elements) : [elements];
    list.forEach((el) => {
      let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
      el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = dy = 0;
        dragging = true;
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        dx = e.touches[0].clientX - startX;
        dy = e.touches[0].clientY - startY;
        // Si vertical-dominant → annule (laisse scroller)
        if (Math.abs(dy) > Math.abs(dx)) { dragging = false; el.style.transform = ''; return; }
        el.style.transform = `translateX(${dx}px)`;
        el.style.transition = 'none';
      }, { passive: true });

      el.addEventListener('touchend', () => {
        if (!dragging) return;
        el.style.transition = 'transform .25s cubic-bezier(.22,.61,.36,1)';
        if (dx <= -THRESHOLD)      { el.style.transform = ''; onLeft(el); }
        else if (dx >= THRESHOLD)  { el.style.transform = ''; onRight(el); }
        else                       { el.style.transform = ''; }
        dragging = false;
      });
    });
  }

  // ── Long-press (700ms par défaut) ────────────────────────
  function attachLongPress(elements, callback, opts = {}) {
    const HOLD = opts.hold || 600;
    const list = elements instanceof NodeList ? Array.from(elements) : [elements];
    list.forEach((el) => {
      let timer = null;
      let cancelled = false;
      let startX = 0, startY = 0;

      const start = (e) => {
        cancelled = false;
        const t = e.touches ? e.touches[0] : e;
        startX = t.clientX; startY = t.clientY;
        timer = setTimeout(() => {
          if (!cancelled) {
            if (navigator.vibrate) navigator.vibrate(20);
            callback(el, e);
          }
        }, HOLD);
      };
      const move = (e) => {
        if (!timer) return;
        const t = e.touches ? e.touches[0] : e;
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
          cancelled = true;
          clearTimeout(timer);
        }
      };
      const cancel = () => { cancelled = true; if (timer) clearTimeout(timer); };

      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchmove',  move,  { passive: true });
      el.addEventListener('touchend',   cancel);
      el.addEventListener('touchcancel',cancel);
    });
  }

  // ── Pinch-zoom + pan helper pour un canvas ───────────────
  function attachPinchPan(el, opts = {}) {
    const onChange = opts.onChange || (() => {});
    const MIN_SCALE = opts.min || 0.5;
    const MAX_SCALE = opts.max || 3;

    let scale = 1, tx = 0, ty = 0;
    let startDist = 0, startScale = 1;
    let startX = 0, startY = 0, startTx = 0, startTy = 0;
    let mode = null; // 'pan' | 'pinch'

    function apply() {
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      el.style.transformOrigin = '0 0';
      onChange({ scale, tx, ty });
    }

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        mode = 'pinch';
        const a = e.touches[0], b = e.touches[1];
        startDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        startScale = scale;
      } else if (e.touches.length === 1) {
        mode = 'pan';
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        startTx = tx; startTy = ty;
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (mode === 'pinch' && e.touches.length === 2) {
        const a = e.touches[0], b = e.touches[1];
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, startScale * (dist / startDist)));
        apply();
        e.preventDefault();
      } else if (mode === 'pan' && e.touches.length === 1) {
        tx = startTx + (e.touches[0].clientX - startX);
        ty = startTy + (e.touches[0].clientY - startY);
        apply();
      }
    }, { passive: false });

    el.addEventListener('touchend', () => { mode = null; });

    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function get()   { return { scale, tx, ty }; }
    return { reset, get };
  }

  return { attachSwipe, attachLongPress, attachPinchPan };
})();
