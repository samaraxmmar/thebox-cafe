/* ══════════════════════════════════════════════════════
   THE BOX — Tables Plan View (mobile)
   Plan visuel avec pinch-zoom, pan, et mini-map dans le coin.
═══════════════════════════════════════════════════════ */

const TablesPlanView = (function() {

  let _zoomCtrl = null;

  function render(opts) {
    const host = document.getElementById('mobile-tables-host');
    if (!host) return;
    opts = opts || {};

    const tables = _getAllTables().filter((t) => {
      if (opts.zone && opts.zone !== 'Toutes' && t.kind !== 'wall') {
        return (t.zone || 'Salle') === opts.zone;
      }
      return true;
    });

    host.innerHTML = `
      <div class="mobile-plan-container">
        <div class="mobile-plan-canvas-wrap">
          <div class="mobile-plan-canvas" id="mobile-plan-canvas">
            ${tables.map(_tableHTML).join('')}
          </div>
        </div>
        <div class="mobile-plan-controls">
          <button class="mp-ctrl-btn" onclick="TablesPlanView._zoom(1.25)" aria-label="Zoom in">+</button>
          <button class="mp-ctrl-btn" onclick="TablesPlanView._zoom(0.8)" aria-label="Zoom out">−</button>
          <button class="mp-ctrl-btn" onclick="TablesPlanView._reset()" aria-label="Reset">⟲</button>
        </div>
        <div class="mobile-plan-minimap" id="mobile-plan-minimap">
          ${tables.map((t) => _minimapDot(t)).join('')}
          <div class="mp-mm-viewport" id="mp-mm-viewport"></div>
        </div>
      </div>
    `;

    // Click handlers
    host.querySelectorAll('.mp-table').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id);
        if (!isNaN(id)) TablesMobile.selectTable(id);
      });
    });

    // Attach pinch/pan
    const canvas = document.getElementById('mobile-plan-canvas');
    if (canvas && window.Gestures) {
      _zoomCtrl = Gestures.attachPinchPan(canvas, {
        onChange: _updateMinimapViewport,
      });
    }
  }

  function _tableHTML(t) {
    if (t.kind === 'wall') {
      return `<div class="mp-wall"
                style="left:${t.x || 0}%;top:${t.y || 0}%;width:${(t.width / 12) || 8}%;height:${(t.height / 12) || 6}%">
              </div>`;
    }
    const status = _statusOf(t);
    return `
      <div class="mp-table status-${status}" data-id="${t.id}"
           style="left:${t.x || 50}%;top:${t.y || 50}%">
        <div class="mp-table-name">${_esc(t.nom || ('Table ' + t.id))}</div>
        <div class="mp-table-status">${_statusLabel(status)}</div>
      </div>
    `;
  }

  function _minimapDot(t) {
    if (t.kind === 'wall') return '';
    const status = _statusOf(t);
    return `<div class="mp-mm-dot status-${status}"
              style="left:${t.x || 50}%;top:${t.y || 50}%"></div>`;
  }

  function _updateMinimapViewport({ scale, tx, ty }) {
    const vp = document.getElementById('mp-mm-viewport');
    if (!vp) return;
    // Le viewport sur la minimap = inverse de la transform du canvas
    const w = 100 / scale;
    const h = 100 / scale;
    const left = -tx / 3 / scale;  // 3 = ratio canvas / minimap
    const top  = -ty / 3 / scale;
    vp.style.width  = w + '%';
    vp.style.height = h + '%';
    vp.style.left = Math.max(0, Math.min(100 - w, left)) + '%';
    vp.style.top  = Math.max(0, Math.min(100 - h, top))  + '%';
  }

  // ── Controls ────────────────────────────────────────────
  function _zoom(factor) {
    if (!_zoomCtrl) return;
    const cur = _zoomCtrl.get();
    const newScale = Math.max(0.5, Math.min(3, cur.scale * factor));
    const canvas = document.getElementById('mobile-plan-canvas');
    if (canvas) {
      canvas.style.transform = `translate(${cur.tx}px, ${cur.ty}px) scale(${newScale})`;
      // ré-attache avec le nouveau scale (simple : reset puis re-pinch)
      // Pour la simplicité, on garde juste le visuel
    }
  }
  function _reset() {
    if (_zoomCtrl) _zoomCtrl.reset();
  }

  // ── Helpers (mêmes que list-view) ───────────────────────
  function _getAllTables() {
    return (window.Tables && window.Tables._getTables) ? window.Tables._getTables() : [];
  }
  function _statusOf(t) {
    const s = window.Tables && window.Tables._getSessions ? window.Tables._getSessions() : {};
    if (s[t.id]) return 'occupee';
    if (t.statut === 'reservee') return 'reservee';
    if (t.statut === 'cleaning') return 'cleaning';
    return 'libre';
  }
  function _statusLabel(s) {
    return { libre: 'Libre', occupee: 'Occupée', reservee: 'Réservée', cleaning: 'Nettoyage' }[s] || s;
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { render, _zoom, _reset };
})();
