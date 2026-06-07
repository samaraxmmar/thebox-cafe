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
    var labels = { admin: 'Administrateur', manager: 'Manager', caissier: 'Caissier', serveur: 'Serveur' };
    if (lbl) lbl.textContent = labels[_user.role] || _user.role;

    // Avatar sidebar
    var iconByRole = { admin: '👑', manager: '🛠', caissier: '💳', serveur: '☕' };
    var avSidebar = document.getElementById('user-avatar');
    if (avSidebar) {
      if (_user.photo) {
        avSidebar.innerHTML = '<img src="' + _user.photo + '" alt="" />';
      } else {
        avSidebar.innerHTML = iconByRole[_user.role] || '👤';
      }
    }

    // Topbar user (avec photo + cadre vert)
    var tn = document.getElementById('topbar-user-name');
    if (tn) tn.textContent = _user.nom || _user.username;
    var tr = document.getElementById('topbar-user-role');
    if (tr) tr.textContent = labels[_user.role] || _user.role;
    var ta = document.getElementById('topbar-user-avatar');
    if (ta) {
      if (_user.photo) {
        ta.innerHTML = '<img src="' + _user.photo + '" alt="" />';
        ta.classList.add('has-photo');
      } else {
        ta.innerHTML = iconByRole[_user.role] || '👤';
        ta.classList.remove('has-photo');
      }
      ta.style.cursor = 'pointer';
      ta.title = 'Changer ma photo de profil';
      ta.onclick = function() { Auth.changeMyPhoto(); };
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

  // Tout utilisateur peut changer SA photo de profil
  function changeMyPhoto() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { Toast.warn('Image trop lourde (max 5 Mo)'); return; }
      try {
        // resize → base64
        var dataUrl = await new Promise(function(resolve, reject) {
          var fr = new FileReader();
          fr.onload = function() {
            var img = new Image();
            img.onload = function() {
              var w = img.width, h = img.height, max = 300;
              if (w > max || h > max) { var r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
              var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
              cv.getContext('2d').drawImage(img, 0, 0, w, h);
              resolve(cv.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = reject;
            img.src = fr.result;
          };
          fr.onerror = reject;
          fr.readAsDataURL(file);
        });
        // upload
        var up = await fetch('/api/upload', {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ data: dataUrl }),
        });
        var j = await up.json();
        if (!up.ok || !j.url) throw new Error(j.error || 'Upload échoué');
        // attacher au compte
        var r = await fetch('/api/auth/me/photo', {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ photo: j.url }),
        });
        var rr = await r.json();
        if (!r.ok || !rr.success) throw new Error(rr.error || 'Erreur');
        _user.photo = j.url;
        Toast.success('Photo mise à jour');
        _applyRoleUI();
      } catch (e) { Toast.error(e.message || 'Erreur'); }
    };
    input.click();
  }

  // ── LOGO custom : stocké en base64 dans localStorage ──
  var LOGO_KEY = 'thebox_custom_logo';
  function _applyCustomLogo() {
    try {
      var url = localStorage.getItem(LOGO_KEY);
      var img = document.getElementById('login-logo-img');
      var text = document.getElementById('login-logo-text');
      if (url && img && text) {
        img.src = url;
        img.style.display = 'block';
        text.style.display = 'none';
      }
    } catch (_) {}
  }
  function uploadLogo(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { Toast.warn('Logo trop lourd (max 1.5 Mo)'); return; }
    var fr = new FileReader();
    fr.onload = function() {
      // Resize 240×240 en base64 pour économiser localStorage
      var im = new Image();
      im.onload = function() {
        var size = 240;
        var cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        var ctx = cv.getContext('2d');
        // Fit contain centered
        var r = Math.min(size/im.width, size/im.height);
        var w = im.width * r, h = im.height * r;
        ctx.clearRect(0,0,size,size);
        ctx.drawImage(im, (size-w)/2, (size-h)/2, w, h);
        var dataUrl = cv.toDataURL('image/png');
        try {
          localStorage.setItem(LOGO_KEY, dataUrl);
          _applyCustomLogo();
          Toast.success('Logo personnalisé enregistré');
        } catch (e) { Toast.error('Impossible d\'enregistrer le logo'); }
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  // Charge le logo au démarrage
  document.addEventListener('DOMContentLoaded', _applyCustomLogo);

  return {
    selectRole: selectRole,
    login: login,
    logout: logout,
    tryRestoreSession: tryRestoreSession,
    can: can,
    user: user,
    role: role,
    perms: perms,
    changeMyPhoto: changeMyPhoto,
    uploadLogo: uploadLogo,
  };
})();
