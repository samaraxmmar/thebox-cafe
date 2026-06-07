/* ══════════════════════════════════════════════════════
   THE BOX — Bottom Sheet (mobile only)
   Composant générique pour afficher du contenu en sheet remontant
   du bas. Gère swipe down pour fermer, backdrop tap, scroll interne.
═══════════════════════════════════════════════════════ */

const BottomSheet = (function() {
  let _root = null;
  let _onClose = null;
  let _dragStartY = null;
  let _dragOffsetY = 0;

  function _ensureRoot() {
    if (_root) return _root;
    const div = document.createElement('div');
    div.className = 'bottom-sheet-overlay';
    div.id = 'bottom-sheet-root';
    div.innerHTML = `
      <div class="bottom-sheet" role="dialog" aria-modal="true">
        <div class="bottom-sheet-handle" aria-label="Glisse pour fermer"></div>
        <div class="bottom-sheet-body"></div>
      </div>
    `;
    document.body.appendChild(div);
    // Click backdrop → close
    div.addEventListener('click', (e) => {
      if (e.target === div) close();
    });
    // Swipe down sur le handle/header → close
    const sheet = div.querySelector('.bottom-sheet');
    sheet.addEventListener('touchstart', _onDragStart, { passive: true });
    sheet.addEventListener('touchmove',  _onDragMove,  { passive: false });
    sheet.addEventListener('touchend',   _onDragEnd);
    _root = div;
    return div;
  }

  function _onDragStart(e) {
    // Drag uniquement si on touche le handle ou le header (top 60px)
    const r = e.currentTarget.getBoundingClientRect();
    if (e.touches[0].clientY - r.top > 64) return; // body : pas de drag
    _dragStartY = e.touches[0].clientY;
    _dragOffsetY = 0;
  }
  function _onDragMove(e) {
    if (_dragStartY == null) return;
    const dy = e.touches[0].clientY - _dragStartY;
    if (dy < 0) return; // ne pas tirer vers le haut
    _dragOffsetY = dy;
    e.currentTarget.style.transform = `translateY(${dy}px)`;
    if (dy > 10) e.preventDefault();
  }
  function _onDragEnd(e) {
    if (_dragStartY == null) return;
    const sheet = e.currentTarget;
    const threshold = sheet.offsetHeight * 0.25;
    if (_dragOffsetY > threshold) {
      close();
    } else {
      sheet.style.transform = '';
    }
    _dragStartY = null;
    _dragOffsetY = 0;
  }

  function open(content, opts = {}) {
    _ensureRoot();
    _root.querySelector('.bottom-sheet-body').innerHTML = content;
    _root.querySelector('.bottom-sheet').style.transform = '';
    _onClose = opts.onClose || null;
    // Active la classe au prochain frame pour déclencher la transition
    requestAnimationFrame(() => _root.classList.add('open'));
    // Empêche le scroll de la page derrière
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!_root) return;
    _root.classList.remove('open');
    document.body.style.overflow = '';
    if (typeof _onClose === 'function') _onClose();
    _onClose = null;
  }

  function isOpen() { return _root && _root.classList.contains('open'); }

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen };
})();
