/* ══════════════════════════════════════════════════════
   THE BOX — Page Utilisateurs + matrice permissions
══════════════════════════════════════════════════════ */

var Users = (function() {
  var _users   = [];
  var _perms   = null; // { catalog, roles, matrix }
  var _editing = null; // user en cours d'édition

  async function render() {
    document.getElementById('users-actions').innerHTML = Auth.can('users.manage')
      ? '<button class="btn btn-primary btn-sm" onclick="Users.openNew()">+ Nouvel utilisateur</button> ' +
        '<button class="btn btn-ghost btn-sm" onclick="Users.openChangePin()">Mon PIN</button>'
      : '<button class="btn btn-ghost btn-sm" onclick="Users.openChangePin()">Mon PIN</button>';

    if (!Auth.can('users.manage')) {
      document.getElementById('users-table').innerHTML  = '<tr><td colspan="6" class="empty-td">Accès refusé</td></tr>';
      document.getElementById('perms-table').innerHTML  = '';
      return;
    }

    await _loadAll();
    _renderUsers();
    _renderPerms();
  }

  async function _loadAll() {
    var u = await API.getUsers();
    _users = Array.isArray(u) ? u : [];
    var p = await API.getPermissions();
    _perms = (p && p.catalog) ? p : null;
  }

  function _renderUsers() {
    var html = '';
    _users.forEach(function(u) {
      var roleLbl = ({ admin:'Administrateur', manager:'Manager', caissier:'Caissier', serveur:'Serveur' })[u.role] || u.role;
      var statut = u.actif === false ? '<span class="badge badge-red">désactivé</span>' : '<span class="badge badge-green">actif</span>';
      var created = u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—';
      html += '<tr>' +
        '<td class="primary">' + u.username + '</td>' +
        '<td>' + (u.nom || '—') + '</td>' +
        '<td>' + roleLbl + '</td>' +
        '<td>' + statut + '</td>' +
        '<td class="mono">' + created + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn-ghost btn-sm" onclick="Users.edit(' + u.id + ')">✎</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="Users.toggleActive(' + u.id + ',' + (u.actif === false ? 'true' : 'false') + ')">' + (u.actif === false ? 'Activer' : 'Désactiver') + '</button>' +
          '<button class="btn btn-danger btn-sm" onclick="Users.remove(' + u.id + ')">🗑</button>' +
        '</td></tr>';
    });
    document.getElementById('users-table').innerHTML = html || '<tr><td colspan="6" class="empty-td">Aucun utilisateur</td></tr>';
  }

  function _renderPerms() {
    if (!_perms) return;
    var roles  = Object.keys(_perms.roles);  // admin, manager, caissier, serveur
    var keys   = Object.keys(_perms.catalog);

    var html = '<thead><tr><th>Permission</th>';
    roles.forEach(function(r) { html += '<th style="text-align:center">' + _perms.roles[r] + '</th>'; });
    html += '</tr></thead><tbody>';

    keys.forEach(function(k) {
      html += '<tr><td>' + _perms.catalog[k] + '<div style="font-size:11px;color:var(--text3);font-variant-numeric:tabular-nums">' + k + '</div></td>';
      roles.forEach(function(r) {
        var checked = r === 'admin' ? true : !!(_perms.matrix[r] && _perms.matrix[r][k]);
        var disabled = (r === 'admin') ? 'disabled' : '';
        html += '<td style="text-align:center"><input type="checkbox" ' + (checked ? 'checked' : '') + ' ' + disabled +
                ' onchange="Users._togglePerm(\'' + r + '\',\'' + k + '\',this.checked)" /></td>';
      });
      html += '</tr>';
    });
    html += '</tbody>';
    document.getElementById('perms-table').innerHTML = html;
  }

  function _togglePerm(role, key, value) {
    if (!_perms) return;
    _perms.matrix[role] = _perms.matrix[role] || {};
    _perms.matrix[role][key] = !!value;
    // Sauvegarde immédiate
    var patch = {}; patch[role] = {}; patch[role][key] = !!value;
    API.updatePermissions(patch).then(function(r) {
      if (r && r.success) Toast.success('Permission mise à jour');
      else Toast.error((r && r.error) || 'Erreur');
    });
  }

  async function resetPerms() {
    if (!confirm('Réinitialiser toutes les permissions aux valeurs par défaut ?')) return;
    var r = await API.resetPermissions();
    if (r && r.success) { Toast.success('Permissions réinitialisées'); await render(); }
    else Toast.error((r && r.error) || 'Erreur');
  }

  function openNew() {
    _editing = null;
    document.getElementById('modal-user-title').textContent = 'Nouvel utilisateur';
    document.getElementById('nu-username').value = '';
    document.getElementById('nu-nom').value = '';
    document.getElementById('nu-role').value = 'caissier';
    document.getElementById('nu-pin').value = '';
    document.getElementById('nu-actif').checked = true;
    document.getElementById('nu-username').disabled = false;
    Modal.open('modal-user');
  }

  function edit(id) {
    var u = _users.find(function(x) { return x.id === id; });
    if (!u) return;
    _editing = u;
    document.getElementById('modal-user-title').textContent = 'Modifier — ' + u.username;
    document.getElementById('nu-username').value = u.username;
    document.getElementById('nu-username').disabled = true; // username non modifiable
    document.getElementById('nu-nom').value = u.nom || '';
    document.getElementById('nu-role').value = u.role || 'caissier';
    document.getElementById('nu-pin').value = '';
    document.getElementById('nu-actif').checked = u.actif !== false;
    Modal.open('modal-user');
  }

  async function save() {
    var username = document.getElementById('nu-username').value.trim();
    var nom      = document.getElementById('nu-nom').value.trim();
    var role     = document.getElementById('nu-role').value;
    var pin      = document.getElementById('nu-pin').value;
    var actif    = document.getElementById('nu-actif').checked;
    if (!username || !nom || !role) { Toast.warn('Champs requis'); return; }

    var r;
    if (_editing) {
      var patch = { nom: nom, role: role, actif: actif };
      if (pin) patch.pin = pin;
      r = await API.updateUser(_editing.id, patch);
    } else {
      if (!pin || pin.length < 4) { Toast.warn('PIN requis (4 chiffres min)'); return; }
      r = await API.createUser({ username: username, nom: nom, role: role, pin: pin, actif: actif });
    }
    if (r && (r.success || r.id)) {
      Toast.success(_editing ? 'Utilisateur modifié' : 'Utilisateur créé');
      Modal.close('modal-user');
      await render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  }

  async function toggleActive(id, actif) {
    var r = await API.updateUser(id, { actif: actif });
    if (r && (r.success || r.id)) { Toast.success('OK'); await render(); }
    else Toast.error((r && r.error) || 'Erreur');
  }

  async function remove(id) {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    var r = await API.deleteUser(id);
    if (r && r.success) { Toast.success('Supprimé'); await render(); }
    else Toast.error((r && r.error) || 'Erreur');
  }

  function openChangePin() {
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-next').value = '';
    Modal.open('modal-changepin');
  }

  async function changePin() {
    var cur = document.getElementById('cp-current').value;
    var nxt = document.getElementById('cp-next').value;
    if (!cur || !nxt) { Toast.warn('Champs requis'); return; }
    var r = await API.changePin(cur, nxt);
    if (r && r.success) { Toast.success('PIN changé'); Modal.close('modal-changepin'); }
    else Toast.error((r && r.error) || 'Erreur');
  }

  return {
    render: render, openNew: openNew, edit: edit, save: save,
    toggleActive: toggleActive, remove: remove,
    openChangePin: openChangePin, changePin: changePin,
    resetPerms: resetPerms, _togglePerm: _togglePerm,
  };
})();
