var Tables = {
  _tables: [],
  _sessions: {},
  _paniers: {},
  STORAGE_TABLES: 'thebox_tables',
  STORAGE_SESSIONS: 'thebox_sessions',
  STORAGE_PANIERS: 'thebox_paniers',

  _defaultTables: [
    { id: 1, numero: 1, nom: 'Table 1', capacite: 4, statut: 'libre' },
    { id: 2, numero: 2, nom: 'Table 2', capacite: 4, statut: 'libre' },
    { id: 3, numero: 3, nom: 'Table 3', capacite: 4, statut: 'libre' },
    { id: 4, numero: 4, nom: 'Table 4', capacite: 6, statut: 'libre' },
    { id: 5, numero: 5, nom: 'Table 5', capacite: 4, statut: 'libre' },
    { id: 6, numero: 6, nom: 'Table 6', capacite: 4, statut: 'libre' },
    { id: 7, numero: 7, nom: 'Terrasse 1', capacite: 4, statut: 'libre' },
    { id: 8, numero: 8, nom: 'Terrasse 2', capacite: 4, statut: 'libre' },
  ],

  _save: function() {
    try {
      localStorage.setItem(this.STORAGE_TABLES, JSON.stringify(this._tables));
      localStorage.setItem(this.STORAGE_SESSIONS, JSON.stringify(this._sessions));
      localStorage.setItem(this.STORAGE_PANIERS, JSON.stringify(this._paniers));
    } catch(e) {}
  },

  _load: function() {
    try {
      var t = localStorage.getItem(this.STORAGE_TABLES);
      var s = localStorage.getItem(this.STORAGE_SESSIONS);
      var p = localStorage.getItem(this.STORAGE_PANIERS);
      this._tables = t ? JSON.parse(t) : JSON.parse(JSON.stringify(this._defaultTables));
      this._sessions = s ? JSON.parse(s) : {};
      this._paniers = p ? JSON.parse(p) : {};
    } catch(e) {
      this._tables = JSON.parse(JSON.stringify(this._defaultTables));
      this._sessions = {};
      this._paniers = {};
    }
  },

  _nextId: function() {
    var max = 0;
    for (var i = 0; i < this._tables.length; i++) { if (this._tables[i].id > max) max = this._tables[i].id; }
    return max + 1;
  },

  _nextNumero: function() {
    var max = 0;
    for (var i = 0; i < this._tables.length; i++) { if ((this._tables[i].numero || 0) > max) max = this._tables[i].numero || 0; }
    return max + 1;
  },

  // Calculer le total du panier d'une table
  getTableTotal: function(tableId) {
    var panier = this._paniers[tableId];
    if (!panier || !panier.length) return 0;
    var total = 0;
    for (var i = 0; i < panier.length; i++) total += panier[i].prix * panier[i].qty;
    return total;
  },

  // Nombre d'articles dans le panier
  getTableCount: function(tableId) {
    var panier = this._paniers[tableId];
    if (!panier) return 0;
    var count = 0;
    for (var i = 0; i < panier.length; i++) count += panier[i].qty;
    return count;
  },

  // Sauvegarder le panier (appele par caisse)
  savePanier: function(tableId, items) {
    this._paniers[tableId] = JSON.parse(JSON.stringify(items));
    this._save();
  },

  // Vider le panier apres paiement
  clearPanier: function(tableId) {
    delete this._paniers[tableId];
    this._save();
  },

  render: async function() {
    var actEl = document.getElementById('tables-header-actions');
    var canAdmin = (typeof Auth !== 'undefined') && Auth.can && Auth.can('tables.admin');
    if (actEl) {
      // Le bouton ↻ Refresh est toujours visible. Les autres : admin uniquement.
      actEl.innerHTML =
        (canAdmin ? '<button class="btn btn-primary btn-sm" onclick="Tables.openAddModal()">+ Ajouter</button>' : '') +
        '<button class="btn btn-ghost btn-sm" title="Rafraîchir" onclick="Tables.render()">↺</button>' +
        (canAdmin ? '<button class="btn btn-danger btn-sm" onclick="Tables.resetAll()">Reset</button>' : '');
    }

    var grid = document.getElementById('tables-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    var data = await API.getTables();
    if (data && !data.error && Array.isArray(data) && data.length > 0) {
      this._tables = data;
      this._sessions = {};
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        var sess = (t.sessions_table || []).find(function(s) { return s.statut === 'ouverte'; });
        if (sess) this._sessions[t.id] = sess;
      }
      this._save();
    } else {
      this._load();
    }
    this._renderGrid();
  },

  _renderGrid: function() {
    var grid = document.getElementById('tables-grid');
    if (!grid) return;
    if (!this._tables.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px">Aucune table</div>';
      return;
    }

    var canAdmin = (typeof Auth !== 'undefined') && Auth.can && Auth.can('tables.admin');

    var html = '';
    for (var i = 0; i < this._tables.length; i++) {
      var t = this._tables[i];
      var sess = this._sessions[t.id];
      var occupee = t.statut === 'occupée' || !!sess;
      var total = this.getTableTotal(t.id);
      var count = this.getTableCount(t.id);
      var couverts = sess ? sess.nb_couverts : 0;

      html += '<div class="table-card ' + (occupee ? 'occupee' : 'libre') + '">';

      // Header
      html += '<div class="table-card-header">';
      html += '<span class="table-num">' + (t.nom || 'Table ' + t.numero) + '</span>';
      html += '<div style="display:flex;gap:6px;align-items:center">';
      html += '<span class="badge ' + (occupee ? 'badge-orange' : 'badge-green') + '">' + (occupee ? 'En cours' : 'Libre') + '</span>';
      if (canAdmin) {
        html += '<button class="btn-del-ing" style="width:24px;height:24px;font-size:12px" onclick="event.stopPropagation();Tables.deleteTable(' + t.id + ')" title="Supprimer">×</button>';
      }
      html += '</div></div>';

      // Body
      html += '<div class="table-card-body">';
      if (occupee) {
        html += '<div class="table-info">';
        html += '<span>👥 ' + couverts + ' couvert' + (couverts > 1 ? 's' : '') + '</span>';
        html += '<span style="font-family:DM Mono,monospace;color:var(--accent);font-size:15px">' + total.toFixed(3) + ' DT</span>';
        html += '</div>';
        if (sess && sess.ouverte_at) html += '<div class="table-time">⏱ ' + _timeSince(sess.ouverte_at) + '</div>';
        if (count > 0) {
          html += '<div style="margin-top:6px;font-size:11px;color:var(--text3)">☕ ' + count + ' article' + (count > 1 ? 's' : '') + '</div>';
        }
      } else {
        html += '<div class="table-info"><span style="color:var(--text3)">👥 ' + (t.capacite || 4) + ' places</span></div>';
        html += '<div class="table-libre-hint">0 article — 0 DT</div>';
      }
      html += '</div>';

      // Actions
      html += '<div class="table-card-actions">';
      if (occupee) {
        html += '<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();Tables.commander(' + t.id + ')">☕ Commander</button>';
        html += '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();Tables.cloturerTable(' + t.id + ')">Clôturer</button>';
      } else {
        html += '<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="event.stopPropagation();Tables.openOpenModal(' + t.id + ')">+ Ouvrir la table</button>';
      }
      html += '</div></div>';
    }
    grid.innerHTML = html;
  },

  openOpenModal: function(tableId) {
    var t = this._tables.find(function(x) { return x.id === tableId; });
    if (!t) return;
    document.getElementById('modal-table-title').textContent = 'Ouvrir ' + (t.nom || 'Table');
    document.getElementById('modal-table-body').innerHTML =
      '<div style="text-align:center;padding:10px 0 16px;font-size:32px">🪑</div>' +
      '<div style="text-align:center;font-size:15px;color:var(--text);margin-bottom:16px">' + (t.nom || 'Table') + ' — ' + (t.capacite || 4) + ' places</div>' +
      '<div class="form-group"><label class="form-label">Nombre de couverts</label>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="qty-btn" style="width:40px;height:40px;font-size:18px" onclick="Tables._chgCouv(-1)">−</button>' +
      '<input class="form-input" type="number" id="modal-couverts" value="2" min="1" max="20" style="text-align:center;font-size:20px;font-family:DM Mono,monospace">' +
      '<button class="qty-btn" style="width:40px;height:40px;font-size:18px" onclick="Tables._chgCouv(1)">+</button>' +
      '</div></div>' +
      '<button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;margin-top:6px" onclick="Tables._doOpen(' + tableId + ')">✓ Ouvrir la table</button>';
    document.getElementById('modal-table-transfer').innerHTML = '';
    Modal.open('modal-table-detail');
  },

  _chgCouv: function(d) {
    var el = document.getElementById('modal-couverts');
    if (!el) return;
    var v = parseInt(el.value) + d;
    if (v < 1) v = 1;
    if (v > 20) v = 20;
    el.value = v;
  },

  _doOpen: async function(tableId) {
    var el = document.getElementById('modal-couverts');
    var nb = parseInt(el ? el.value : '0');
    if (!nb || nb < 1) { Toast.warn('Entre un nombre de couverts'); return; }
    var t = this._tables.find(function(x) { return x.id === tableId; });
    try { await API.openTable(tableId, nb); } catch (e) {}
    for (var i = 0; i < this._tables.length; i++) {
      if (this._tables[i].id === tableId) { this._tables[i].statut = 'occupée'; break; }
    }
    this._sessions[tableId] = { id: null, nb_couverts: nb, total: 0, statut: 'ouverte', ouverte_at: new Date().toISOString() };
    this._paniers[tableId] = [];
    this._save();
    Modal.close('modal-table-detail');
    Toast.success((t ? t.nom : 'Table') + ' ouverte — ' + nb + ' couvert' + (nb > 1 ? 's' : ''));
    this._renderGrid();
  },

  commander: function(tableId) {
    var t = this._tables.find(function(x) { return x.id === tableId; });
    var sess = this._sessions[tableId];
    if (!t) return;
    var sid = (sess && sess.id && sess.id < 2147483647) ? sess.id : null;
    Caisse.setTable(tableId, sid, t.nom || 'Table ' + t.numero);
    Nav.go('caisse');
    Toast.success('Commande pour ' + (t.nom || 'Table'));
  },

  cloturerTable: async function(tableId) {
    var t = this._tables.find(function(x) { return x.id === tableId; });
    var total = this.getTableTotal(tableId);
    var count = this.getTableCount(tableId);

    var msg = 'Cloturer ' + (t ? t.nom : 'la table') + ' ?';
    if (count > 0) {
      msg += '\n' + count + ' article(s) en cours — ' + total.toFixed(3) + ' DT';
      msg += '\n⚠️ Ces articles seront perdus !';
    }
    if (!confirm(msg)) return;

    try { await API.closeTable(tableId); } catch (e) {}
    for (var j = 0; j < this._tables.length; j++) {
      if (this._tables[j].id === tableId) { this._tables[j].statut = 'libre'; break; }
    }
    delete this._sessions[tableId];
    delete this._paniers[tableId];
    this._save();
    Caisse.clearTable();
    Toast.success((t ? t.nom : 'Table') + ' cloturee — ' + total.toFixed(3) + ' DT');
    this._renderGrid();
  },

  openAddModal: function() {
    document.getElementById('modal-table-title').textContent = 'Nouvelle table';
    document.getElementById('modal-table-body').innerHTML =
      '<div class="form-group"><label class="form-label">Nom</label><input class="form-input" id="new-table-nom" placeholder="Ex: Terrasse 3"></div>' +
      '<div class="form-group"><label class="form-label">Capacite</label><input class="form-input" type="number" id="new-table-cap" value="4" min="1"></div>' +
      '<div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" onclick="Modal.close(\'modal-table-detail\')">Annuler</button><button class="btn btn-primary" onclick="Tables._doAdd()">Ajouter</button></div>';
    document.getElementById('modal-table-transfer').innerHTML = '';
    Modal.open('modal-table-detail');
  },

  _doAdd: function() {
    var nomEl = document.getElementById('new-table-nom');
    var capEl = document.getElementById('new-table-cap');
    var nom = nomEl ? nomEl.value.trim() : '';
    var cap = parseInt(capEl ? capEl.value : '4') || 4;
    if (!nom) { Toast.warn('Donne un nom'); return; }
    this._tables.push({ id: this._nextId(), numero: this._nextNumero(), nom: nom, capacite: cap, statut: 'libre' });
    this._save();
    Modal.close('modal-table-detail');
    Toast.success('"' + nom + '" ajoutee');
    this._renderGrid();
  },

  deleteTable: function(tableId) {
    var t = this._tables.find(function(x) { return x.id === tableId; });
    if (!t) return;
    if (this._sessions[tableId]) { Toast.warn('Ferme "' + t.nom + '" avant'); return; }
    if (!confirm('Supprimer "' + t.nom + '" ?')) return;
    this._tables = this._tables.filter(function(x) { return x.id !== tableId; });
    delete this._paniers[tableId];
    this._save();
    Toast.success('"' + t.nom + '" supprimee');
    this._renderGrid();
  },

  resetAll: function() {
    if (!confirm('Reinitialiser toutes les tables ?')) return;
    this._tables = JSON.parse(JSON.stringify(this._defaultTables));
    this._sessions = {};
    this._paniers = {};
    this._save();
    Caisse.clearTable();
    Toast.success('Tables reinitialisees');
    this._renderGrid();
  },

  transferer: async function(fromId) {
    var destEl = document.getElementById('transfer-dest');
    var toId = destEl ? parseInt(destEl.value) : 0;
    if (!toId) return;
    try { await API.transferTable(fromId, toId); } catch (e) {}
    this._sessions[toId] = this._sessions[fromId];
    this._paniers[toId] = this._paniers[fromId] || [];
    delete this._sessions[fromId];
    delete this._paniers[fromId];
    for (var i = 0; i < this._tables.length; i++) {
      if (this._tables[i].id === fromId) this._tables[i].statut = 'libre';
      if (this._tables[i].id === toId) this._tables[i].statut = 'occupée';
    }
    this._save();
    Toast.success('Transfert effectue');
    Modal.close('modal-table-detail');
    this._renderGrid();
  },

  addCommandToTable: function() {},
  addToTotal: function() {}
};

function _timeSince(dateStr) {
  var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "a l'instant";
  if (diff < 60) return diff + ' min';
  var h = Math.floor(diff / 60);
  var m = diff % 60;
  return h + 'h' + (m > 0 ? m + 'min' : '');
}