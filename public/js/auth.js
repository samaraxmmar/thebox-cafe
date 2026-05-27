/* ══════════════════════════════════════════════════════
   THE BOX — Auth client (cookies httpOnly + perms réelles)
══════════════════════════════════════════════════════ */

const Auth = (() => {
  let _user        = null;
  let _perms       = {};
  let _selectedRole = null; // pour préselect dans l'UI (optionnel)

  // ── Public ─────────────────────────────────────────
  function selectRole(role) {
    _selectedRole = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    var btn = document.getElementById('role-' + role);
    if (btn) btn.classList.add('selected');
    // Pré-remplit l'username si possible
    var u = document.getElementById('login-username');
    if (u && !u.value) {
      var map = { admin: 'admin', manager: 'manager', caissier: 'caisse', serveur: 'serveur' };
      u.value = map[role] || '';
    }
    var pin = document.getElementById('pin-input');
    if (pin) pin.focus();
    var err = document.getElementById('login-error');
    if (err) err.textContent = '';
  }

  async function login() {
    var err = document.getElementById('login-error');
    var username = (document.getElementById('login-username') || {}).value || _selectedRole || '';
    var pin      = document.getElementById('pin-input').value;

    err.textContent = '';
    if (!username) { err.textContent = 'Choisis un rôle ou saisis ton identifiant'; return; }
    if (!pin)      { err.textContent = 'Code PIN requis'; return; }

    try {
      var res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:    JSON.stringify({ username: username, pin: pin }),
      });
      var data = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = data.error || 'Échec connexion'; return; }

      _user  = data.user;
      await _refreshPerms();

      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-shell').style.display = 'flex';
      _applyRoleUI();
      if (window.App && typeof App.init === 'function') App.init();
    } catch (e) {
      err.textContent = 'Erreur réseau';
    }
  }

  async function _refreshPerms() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      var data = await res.json();
      _user  = data.user;
      _perms = data.permissions || {};
    } catch (_) {}
  }

  async function tryRestoreSession() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return false;
      var data = await res.json();
      _user  = data.user;
      _perms = data.permissions || {};
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-shell').style.display = 'flex';
      _applyRoleUI();
      if (window.App && typeof App.init === 'function') App.init();
      return true;
    } catch (_) { return false; }
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
    _user = null; _perms = {};
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').style.display = 'none';
    var pin = document.getElementById('pin-input'); if (pin) pin.value = '';
    var err = document.getElementById('login-error'); if (err) err.textContent = '';
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  }

  // can(permKey) — vrai si le user a la permission
  function can(perm) {
    if (!_user) return false;
    if (_user.role === 'admin') return true;
    return !!_perms[perm];
  }
  function user() { return _user; }
  function role() { return _user && _user.role; }
  function perms() { return _perms; }

  // ── Private ─────────────────────────────────────────
  function _applyRoleUI() {
    if (!_user) return;
    var isAdmin = _user.role === 'admin';
    var av = document.getElementById('user-avatar');
    if (av) {
      var iconByRole = { admin: '👑', manager: '🛠', caissier: '💳', serveur: '☕' };
      av.className   = 'user-avatar ' + (isAdmin ? 'avatar-admin' : 'avatar-serveur');
      av.textContent = iconByRole[_user.role] || '👤';
    }
    var n = document.getElementById('user-name');
    if (n) n.textContent = _user.nom || _user.username;
    var lbl = document.getElementById('user-role-lbl');
    if (lbl) {
      var labels = { admin: 'Administrateur', manager: 'Manager', caissier: 'Caissier', serveur: 'Serveur' };
      lbl.textContent = labels[_user.role] || _user.role;
    }

    // Gating de la navigation par permission
    _gateNav('dashboard',  can('dashboard.view'));
    _gateNav('tables',     can('tables.view'));
    _gateNav('caisse',     can('orders.create'));
    _gateNav('commandes',  can('orders.history'));
    _gateNav('produits',   can('products.view'));
    _gateNav('stock',      can('stock.view'));
    _gateNav('users',      can('users.manage'));
    _gateNav('parametres', can('settings.view'));
  }

  function _gateNav(page, allowed) {
    document.querySelectorAll('[data-page="' + page + '"]').forEach(function(el) {
      el.classList.toggle('locked', !allowed);
      el.style.display = allowed ? '' : 'none';
    });
  }

  return {
    selectRole: selectRole,
    login: login,
    logout: logout,
    tryRestoreSession: tryRestoreSession,
    can: can,
    user: user,
    role: role,
    perms: perms,
  };
})();
