/* ══════════════════════════════════════════════════════
   THE BOX — Toast notifications
══════════════════════════════════════════════════════ */

const Toast = {
  _icons: { success: '✓', warn: '!', error: '✕' },

  _show(msg, type) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<div class="toast-icon">${this._icons[type]}</div><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
  },

  success(msg) { this._show(msg, 'success'); },
  warn(msg)    { this._show(msg, 'warn'); },
  error(msg)   { this._show(msg, 'error'); },
};
