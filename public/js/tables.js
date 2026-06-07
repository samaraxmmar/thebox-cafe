/* ══════════════════════════════════════════════════════
   THE BOX — Tables (plan de salle DRAG-AND-DROP)
══════════════════════════════════════════════════════ */

var Tables = (function() {
  var _tables   = [];
  var _sessions = {};
  var _paniers  = {};
  var _selected = null;
  var _zone     = 'Toutes';
  var _editing  = false;
  var _editingId = null;
  var _dirty    = {};
  var _search   = '';
  var _tablesFallbackPos = null;  // override positions pour tables hors zone visible

  var STORAGE_PANIERS = 'thebox_paniers';

  function _saveLocal() { try { localStorage.setItem(STORAGE_PANIERS, JSON.stringify(_paniers)); } catch (_) {} }
  function _loadLocal() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_PANIERS) || '{}');
      // ⚡ MUTATE l'objet existant — JAMAIS réassigner !
      // Sinon l'export Tables._paniers devient stale (référence à l'ancien objet)
      Object.keys(_paniers).forEach(function(k) { delete _paniers[k]; });
      Object.keys(parsed).forEach(function(k) { _paniers[k] = parsed[k]; });
    } catch (_) {
      Object.keys(_paniers).forEach(function(k) { delete _paniers[k]; });
    }
  }
  _loadLocal();

  function savePanier(tableId, items) { _paniers[tableId] = JSON.parse(JSON.stringify(items || [])); _saveLocal(); }
  function clearPanier(tableId) { delete _paniers[tableId]; _saveLocal(); }
  function getTableTotal(tableId) { var p = _paniers[tableId]; if (!p || !p.length) return 0; var t = 0; for (var i=0;i<p.length;i++) t += (p[i].prix||0) * (p[i].qty||0); return t; }
  function getTableCount(tableId) { var p = _paniers[tableId]; if (!p) return 0; var c = 0; for (var i=0;i<p.length;i++) c += p[i].qty || 0; return c; }

  function _renderHeaderActions() {
    var el = document.getElementById('tables-header-actions');
    if (!el) return;
    var canAdmin = Auth.can && Auth.can('tables.admin');
    var html = '';
    if (canAdmin) {
      html += '<button class="btn-floor-add" onclick="Tables.openAddModal()"><span style="font-size:14px;font-weight:700">+</span> Ajouter une nouvelle table</button>';
      if (_editing) {
        html += '<button class="btn-floor-wall" onclick="Tables.addWall()">🧱 Mur</button>';
        var dirtyCount = Object.keys(_dirty).length;
        html += '<button class="btn-floor-save" onclick="Tables.exitEditMode()"><span style="font-size:13px">💾</span> Sauvegarder' + (dirtyCount ? ' (' + dirtyCount + ')' : '') + '</button>';
        html += '<button class="btn btn-ghost btn-sm" onclick="Tables.cancelEditMode()" title="Annuler">✕</button>';
      } else {
        html += '<button class="btn btn-secondary btn-sm" onclick="Tables.enterEditMode()">✏ Éditer le plan</button>';
      }
    }
    html += '<button class="btn btn-ghost btn-sm" title="Rafraîchir" onclick="Tables.render()">↺</button>';
    el.innerHTML = html;
  }

  function _renderZones() {
    var el = document.getElementById('tables-zones');
    if (!el) return;
    var zones = ['Toutes'].concat(Array.from(new Set(_tables.filter(function(t){return t.kind!=='wall'}).map(function(t) { return t.zone || 'Salle'; }))).sort());
    el.innerHTML = zones.map(function(z) {
      var label = z === 'Toutes' ? 'Toutes' : z;
      var count = _tables.filter(function(t) { return t.kind!=='wall' && (z === 'Toutes' || (t.zone || 'Salle') === z); }).length;
      return '<button class="zone-seg ' + (z === _zone ? 'active' : '') + '" onclick="Tables.setZone(\'' + z.replace(/'/g, "\\'") + '\')"><span>' + label + '</span><span class="zone-seg-count">' + count + '</span></button>';
    }).join('');
  }

  function _renderKPI() {
    var el = document.getElementById('tables-kpi');
    if (!el) return;
    var tables = _tables.filter(function(t) { return t.kind !== 'wall'; });
    var total = tables.length;
    var occupied = tables.filter(function(t) { return _sessions[t.id]; }).length;
    var reserved = tables.filter(function(t) { return t.statut === 'reservee'; }).length;
    var available = total - occupied - reserved;
    var rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    // KPI style aligné sur Dashboard — kpi-pro avec dégradés colorés
    el.innerHTML = ''
      + '<div class="kpi-pro" data-kpi="tables-total">'
      +   '<div class="kpi-pro-head"><span class="kpi-pro-icon">🪑</span><span class="kpi-pro-lbl">Total tables</span></div>'
      +   '<div class="kpi-pro-val">' + total + '</div>'
      +   '<div class="kpi-pro-sub">' + (total > 1 ? 'tables au total' : 'table au total') + '</div>'
      + '</div>'
      + '<div class="kpi-pro" data-kpi="tables-occ">'
      +   '<div class="kpi-pro-head"><span class="kpi-pro-icon">👥</span><span class="kpi-pro-lbl">Occupées</span></div>'
      +   '<div class="kpi-pro-val">' + occupied + '</div>'
      +   '<div class="kpi-pro-sub">' + (total > 0 ? Math.round(occupied / total * 100) + '% du total' : '—') + '</div>'
      + '</div>'
      + '<div class="kpi-pro" data-kpi="tables-res">'
      +   '<div class="kpi-pro-head"><span class="kpi-pro-icon">📅</span><span class="kpi-pro-lbl">Réservées</span></div>'
      +   '<div class="kpi-pro-val">' + reserved + '</div>'
      +   '<div class="kpi-pro-sub">' + (reserved > 0 ? 'réservation' + (reserved > 1 ? 's' : '') + ' active' + (reserved > 1 ? 's' : '') : 'aucune réservation') + '</div>'
      + '</div>'
      + '<div class="kpi-pro" data-kpi="tables-free">'
      +   '<div class="kpi-pro-head"><span class="kpi-pro-icon">✓</span><span class="kpi-pro-lbl">Disponibles</span></div>'
      +   '<div class="kpi-pro-val">' + available + '</div>'
      +   '<div class="kpi-pro-sub">prêtes à accueillir</div>'
      + '</div>'
      + '<div class="kpi-pro" data-kpi="tables-rate">'
      +   '<div class="kpi-pro-head"><span class="kpi-pro-icon">📊</span><span class="kpi-pro-lbl">Taux d\'occupation</span></div>'
      +   '<div class="kpi-pro-val">' + rate + '%</div>'
      +   '<div class="kpi-pro-meter"><div class="kpi-pro-meter-fill" style="width:' + rate + '%"></div></div>'
      +   '<div class="kpi-pro-sub">' + occupied + ' / ' + total + ' occupée' + (occupied > 1 ? 's' : '') + '</div>'
      + '</div>';

    var live = document.getElementById('tables-live-count');
    if (live) live.textContent = occupied + ' / ' + total + ' occupées';
  }

  function _statusOf(t) {
    if (_sessions[t.id]) return 'occupee';
    if (t.statut === 'reservee') return 'reservee';
    if (t.statut === 'cleaning') return 'cleaning';
    return 'libre';
  }
  function _matches(t) {
    if (_zone !== 'Toutes' && (t.zone || 'Salle') !== _zone) return false;
    if (_search && t.kind !== 'wall') {
      var q = _search.toLowerCase();
      if (((t.nom || 'Table ' + t.id).toLowerCase()).indexOf(q) < 0 && ((t.zone || '').toLowerCase()).indexOf(q) < 0) return false;
    }
    return true;
  }
  function setSearch(q) { _search = (q || '').trim(); _renderFloor(); }
  function _formatTime(dateStr) { if (!dateStr) return ''; return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

  function _chairsHtml(shape, capacite) {
    capacite = Math.max(1, Math.min(12, parseInt(capacite) || 4));
    if (shape === 'round') {
      var html = '';
      for (var i = 0; i < capacite; i++) html += '<span class="table-chair round-chair" style="--a:' + (360 / capacite * i) + 'deg"></span>';
      return html;
    }
    return '';
  }
  function _setRoundChairRadius(cardEl) { var r = (Math.min(cardEl.offsetWidth, cardEl.offsetHeight) / 2) + 14; cardEl.style.setProperty('--chair-r', r + 'px'); }
  function _setRectChairs(cardEl) {
    var w = cardEl.offsetWidth, h = cardEl.offsetHeight;
    if (!w || !h) return;
    cardEl.querySelectorAll('.table-chair.auto').forEach(function(c) { c.remove(); });
    var SPACING = 42, MIN_SIDE = 50;
    var nT = Math.max(1, Math.round(w / SPACING)), nB = nT;
    var nL = h >= MIN_SIDE ? Math.max(1, Math.round(h / SPACING)) : 0, nR = nL;
    var html = '';
    for (var i = 0; i < nT; i++) html += '<span class="table-chair top auto" style="left:' + (100 / (nT + 1) * (i + 1)) + '%"></span>';
    for (var j = 0; j < nB; j++) html += '<span class="table-chair bottom auto" style="left:' + (100 / (nB + 1) * (j + 1)) + '%"></span>';
    for (var k = 0; k < nL; k++) html += '<span class="table-chair left auto" style="top:' + (100 / (nL + 1) * (k + 1)) + '%"></span>';
    for (var m = 0; m < nR; m++) html += '<span class="table-chair right auto" style="top:' + (100 / (nR + 1) * (m + 1)) + '%"></span>';
    cardEl.insertAdjacentHTML('afterbegin', html);
  }

  function _renderFloor() {
    var el = document.getElementById('tables-grid');
    if (!el) return;
    el.classList.toggle('edit-mode', _editing);

    // ⚡ Safety net : détecte tables hors zone OU stackées, force grille propre
    //    DÉSACTIVÉ en mode édition (sinon le drag est inutilisable)
    _tablesFallbackPos = {};
    if (!_editing) {
      var realTables = _tables.filter(function(t) { return t.kind !== 'wall'; });
      var walls      = _tables.filter(function(t) { return t.kind === 'wall'; });
      var problematic = 0;
      var positions = {};
      realTables.forEach(function(tt) {
        var tx = (tt.x != null ? parseFloat(tt.x) : 50);
        var ty = (tt.y != null ? parseFloat(tt.y) : 50);
        if (tx < 0 || tx > 95 || ty < 0 || ty > 92) { problematic++; return; }
        var key = Math.floor(tx / 10) + '_' + Math.floor(ty / 10);
        if (positions[key]) problematic++;
        positions[key] = true;
      });

      // Si > 30% des tables ont un problème → force TOUT le plan en grille
      if (realTables.length > 0 && (problematic / realTables.length) > 0.3) {
        console.warn('[Tables] ' + problematic + '/' + realTables.length + ' tables problématiques — affichage forcé en grille propre');
        var sorted = realTables.slice().sort(function(a, b) {
          var na = (a.nom || 'Table ' + a.id), nb = (b.nom || 'Table ' + b.id);
          return na.localeCompare(nb, undefined, { numeric: true });
        });
        var COLS = 6;
        var STEP_X = 100 / (COLS + 1);
        var STEP_Y = 13;
        var START_X = 3, START_Y = 3;
        sorted.forEach(function(tt, idx) {
          var col = idx % COLS, row = Math.floor(idx / COLS);
          _tablesFallbackPos[tt.id] = { x: START_X + col * STEP_X, y: START_Y + row * STEP_Y };
        });
        walls.forEach(function(w) { _tablesFallbackPos[w.id] = { x: -999, y: -999 }; });
      }
    }

    var list = _tables.filter(_matches);
    var cardsHtml = '';
    if (!list.length) {
      cardsHtml = '<div class="empty-state" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:60px 20px;text-align:center"><div style="font-size:48px;opacity:.3;margin-bottom:12px">🪑</div><div style="font-size:15px;font-weight:600">Aucune table dans cette zone</div>' + (Auth.can('tables.admin') ? '<div style="margin-top:12px"><button class="btn btn-primary" onclick="Tables.openAddModal()">+ Créer une table</button></div>' : '') + '</div>';
    } else {
      cardsHtml = list.map(function(t) {
        var isWall = (t.kind === 'wall');
        var status = isWall ? 'wall' : _statusOf(t);
        var sess = !isWall ? _sessions[t.id] : null;
        var selected = (_selected && _selected.id === t.id && !isWall) ? ' selected' : '';
        var shape = t.shape || (isWall ? 'rect' : 'square');
        var x = (t.x != null ? t.x : 50), y = (t.y != null ? t.y : 50);
        var w = (t.width != null ? t.width : null), h = (t.height != null ? t.height : null);
        if (_dirty[t.id]) { var d = _dirty[t.id]; if (d.x != null) x = d.x; if (d.y != null) y = d.y; if (d.width != null) w = d.width; if (d.height != null) h = d.height; }
        // Override position + taille si fallback grille actif
        if (_tablesFallbackPos && _tablesFallbackPos[t.id]) {
          x = _tablesFallbackPos[t.id].x;
          y = _tablesFallbackPos[t.id].y;
          // En mode fallback, force des tailles uniformes (sinon Table 3 énorme couvre les autres)
          var floorElX = document.getElementById('tables-floor-wrap');
          var fW = floorElX ? floorElX.offsetWidth : 1200;
          var fH = floorElX ? floorElX.offsetHeight : 800;
          w = Math.round(fW * 0.115);   // ~11.5% largeur
          h = Math.round(fH * 0.10);    // ~10% hauteur
        }
        
        var label = t.nom || (isWall ? 'Mur' : ('Table ' + t.id));
        var delBtn = _editing ? '<button class="table-card-del" title="Supprimer" onclick="event.stopPropagation();Tables.delete(' + t.id + ')">×</button>' : '';
        var editBtn = _editing ? '<button class="table-card-edit" title="Modifier" onclick="event.stopPropagation();Tables.openEditModal(' + t.id + ')">✎</button>' : '';
        var resizeHandle = _editing ? '<span class="table-card-resize" title="Glisse pour redimensionner" ondblclick="event.stopPropagation();Tables.cycleShape(' + t.id + ')"></span>' : '';

        var style = 'left:' + x + '%;top:' + y + '%';
        var customAttr = '';
        var floorEl2 = document.getElementById('tables-floor-wrap');
        var floorW = floorEl2 ? floorEl2.offsetWidth : 1200;
        var floorH = floorEl2 ? floorEl2.offsetHeight : 800;
        
        if (w && h) {
          // RESPECTE la taille sauvegardée — pas de cap, l'utilisateur garde le contrôle
          style += ';width:' + ((w / floorW) * 100) + '%;height:' + ((h / floorH) * 100) + '%';
          customAttr = ' data-custom-size="1"';
        } else if (!w || !h) {
          // Tailles par défaut SEULEMENT pour les nouvelles tables (sans w/h sauvegardés)
          var defW, defH;
          if (shape === 'round')      { defW = 50; defH = 50; }
          else if (shape === 'rect')  { defW = 70; defH = 45; }
          else                        { defW = 50; defH = 50; }
          style += ';width:' + ((defW / floorW) * 100) + '%;height:' + ((defH / floorH) * 100) + '%';
        }
        var rot = parseInt(t.rotation) || 0;
        if (_dirty[t.id] && _dirty[t.id].rotation != null) rot = _dirty[t.id].rotation;
        if (rot) style += ';--rot:' + rot + 'deg';

        if (isWall) {
          return '<div class="table-card is-wall ' + status + selected + '" data-id="' + t.id + '" data-shape="' + shape + '"' + customAttr + ' style="' + style + '" onclick="Tables.handleCardClick(event,' + t.id + ')"><span class="table-name">' + label + '</span>' + editBtn + delBtn + resizeHandle + '</div>';
        }

        var statusLabel = status === 'occupee' ? 'Occupée' : status === 'reservee' ? 'Réservée' : status === 'cleaning' ? 'Ménage' : 'Libre';
        var statusIcon = status === 'occupee' ? '●' : status === 'reservee' ? '○' : status === 'cleaning' ? '◐' : '○';
        var capacity = (t.capacite || 4);
        var metricsHtml = '';
        if (sess) {
          var total = getTableTotal(t.id);
          metricsHtml = '<div class="table-card-bottom"><div class="table-metric"><span class="table-metric-icon">⏱</span><span class="table-metric-val">' + _timeSince(sess.ouverte_at) + '</span></div><div class="table-metric"><span class="table-metric-icon">💰</span><span class="table-metric-val">' + (total > 0 ? total.toFixed(2) + ' DT' : '—') + '</span></div></div>';
        }

        return '<div class="table-card is-table ' + status + selected + '" data-id="' + t.id + '" data-shape="' + shape + '"' + customAttr + ' data-zone="' + (t.zone || 'Salle').replace(/"/g, '') + '" style="' + style + '" onclick="Tables.handleCardClick(event,' + t.id + ')">'
          + _chairsHtml(shape, capacity)
          + '<div class="table-card-inner">'
          + '  <div class="table-card-top"><span class="table-name">' + label + '</span><span class="table-status-pill"><span class="table-status-dot">' + statusIcon + '</span> ' + statusLabel + '</span></div>'
          + '  <div class="table-card-mid"><span class="table-seats"><span class="table-seats-icon">👥</span> ' + (sess ? sess.nb_couverts : capacity) + (sess ? ' / ' + capacity : ' places') + '</span></div>'
          + (metricsHtml ? metricsHtml : '')
          + '</div>'
          + editBtn + delBtn + resizeHandle + '</div>';
      }).join('');
    }

    var footer = _editing ? '<div id="floor-info" class="floor-info-bar">✏ Glisse les tables OU clique puis utilise les <strong>flèches clavier ←↑↓→</strong> · Shift = pas plus grand</div>' : '';
    el.innerHTML = cardsHtml + footer;

    el.querySelectorAll('.table-card[data-shape="round"]').forEach(_setRoundChairRadius);
    el.querySelectorAll('.table-card.is-table[data-shape="square"], .table-card.is-table[data-shape="rect"]').forEach(_setRectChairs);

    if (_editing) _wireDrag(el);
    
    // 🎯 PLUS DE TRANSFORM SCALE
    _scaleFloor();
  }

  /* ═════════════════════════════════════════════════════
     LE FIX PRINCIPAL : PLUS DE SCALE, CANVAS 100% NATIF
     ═════════════════════════════════════════════════════ */
  var FLOOR_W = 1800, FLOOR_H = 1100;
  function _scaleFloor() {
    var floor = document.getElementById('tables-grid');
    if (!floor) return;
    floor.style.transform = ''; 
    floor.style.transformOrigin = '';
    _drag.scale = 1;
    _resize.scale = 1;
  }
  window.addEventListener('resize', _scaleFloor);

  function _renderSide() {
    var el = document.getElementById('tables-side');
    if (!el) return;
    el.innerHTML = _tables.map(function(t) { var s = _statusOf(t); var l = (t.nom || 'T-' + t.id).replace(/^T-?/i, ''); return '<div class="side-num ' + s + '" onclick="Tables.select(' + t.id + ')" title="' + (t.nom || ('Table ' + t.id)) + '">' + l + '</div>'; }).join('');
  }

  function _renderActionbar() { _renderDetailsPanel(); }

  function _renderDetailsPanel() {
    var panel = document.getElementById('tables-details-panel');
    var overlay = document.getElementById('tables-details-overlay');
    var layout = document.getElementById('tables-layout-pro');
    if (!panel) return;

    if (!_selected || _editing || _selected.kind === 'wall') {
      // Ferme l'overlay
      if (overlay) overlay.classList.remove('open');
      panel.classList.remove('open');
      if (layout) layout.classList.remove('with-details');
      panel.innerHTML = '';
      return;
    }

    var t = _selected, sess = _sessions[t.id], status = _statusOf(t);
    var statusLabel = status === 'occupee' ? 'Occupée' : status === 'reservee' ? 'Réservée' : status === 'cleaning' ? 'En nettoyage' : 'Disponible';
    var total = sess ? getTableTotal(t.id) : 0, itemCount = sess ? getTableCount(t.id) : 0;
    var canManage = Auth.can('orders.create'), canAdmin = Auth.can('tables.admin');
    var resa = t.reservation;

    if (overlay) overlay.classList.add('open');
    panel.classList.add('open');
    if (layout) layout.classList.add('with-details');

    var primaryAction = sess ? '<button class="btn btn-primary btn-block" onclick="Tables.actionSelected()">📋 Reprendre la commande →</button>' : '<button class="btn btn-primary btn-block" onclick="Tables.actionSelected()">▶ Ouvrir & commander</button>';

    panel.innerHTML = ''
      + '<div class="details-head"><button class="details-close" onclick="Tables.cancelSelection()" title="Fermer">✕</button><div class="details-status details-status-' + status + '">' + statusLabel + '</div><h2 class="details-title">' + (t.nom || ('Table ' + t.id)) + '</h2><div class="details-subtitle">' + (t.zone || 'Salle') + '</div></div>'
      + '<div class="details-body"><div class="details-metrics"><div class="details-metric"><div class="details-metric-lbl">Capacité</div><div class="details-metric-val">' + (t.capacite || 4) + ' places</div></div>'
      + (sess ? '<div class="details-metric"><div class="details-metric-lbl">Couverts</div><div class="details-metric-val">' + sess.nb_couverts + '</div></div>' : '')
      + (sess ? '<div class="details-metric"><div class="details-metric-lbl">Ouvert à</div><div class="details-metric-val">' + _formatTime(sess.ouverte_at) + '</div></div>' : '')
      + (sess ? '<div class="details-metric"><div class="details-metric-lbl">Durée</div><div class="details-metric-val">' + _timeSince(sess.ouverte_at) + '</div></div>' : '')
      + '</div>';

    if (sess) {
      panel.innerHTML += '<div class="details-bill"><div class="details-bill-row"><span>Articles</span><strong>' + itemCount + '</strong></div><div class="details-bill-row details-bill-total"><span>Total en cours</span><strong>' + total.toFixed(3) + ' DT</strong></div></div>';
    }

    if (resa && !sess) {
      var dt = new Date(resa.date_time);
      var dateStr = isNaN(dt) ? resa.date_time : dt.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
      var timeStr = isNaN(dt) ? '' : dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      panel.innerHTML += '<div class="details-reservation"><div class="details-reservation-head"><span class="details-reservation-icon">📅</span><span class="details-reservation-title">Réservation</span></div><div class="details-reservation-row"><span>Client</span><strong>' + (resa.client_name || '—') + '</strong></div>' + (resa.phone ? '<div class="details-reservation-row"><span>Téléphone</span><strong>' + resa.phone + '</strong></div>' : '') + '<div class="details-reservation-row"><span>Quand</span><strong>' + dateStr + ' · ' + timeStr + '</strong></div><div class="details-reservation-row"><span>Couverts</span><strong>' + resa.nb_couverts + '</strong></div>' + (resa.notes ? '<div class="details-reservation-notes">📝 ' + resa.notes + '</div>' : '') + '</div>';
    }

    var actions = '<div class="details-actions">';
    if (canManage) actions += primaryAction;
    if (canManage && !sess && !resa) actions += '<button class="btn btn-secondary btn-block" onclick="Tables.openReservationModal(' + t.id + ')">📅 Réserver la table</button>';
    if (canManage && resa && !sess) actions += '<button class="btn btn-danger btn-block" onclick="Tables.cancelReservation(' + t.id + ')">✕ Annuler la réservation</button>';
    if (sess) {
      if (canAdmin) actions += '<button class="btn btn-secondary btn-block" onclick="Tables.promptTransfer(' + t.id + ')">⇄ Transférer la table</button>';
      if (canAdmin) actions += '<button class="btn btn-secondary btn-block" onclick="Tables.printBill(' + t.id + ')">🖨 Imprimer l\'addition</button>';
      if (canAdmin) actions += '<button class="btn btn-danger btn-block" onclick="Tables.closeFromPanel(' + t.id + ')">✕ Fermer la table</button>';
    }
    if (canAdmin) actions += '<button class="btn btn-ghost btn-block" onclick="Tables.openEditModal(' + t.id + ')">✎ Modifier la table</button>';
    actions += '</div></div>';
    panel.innerHTML += actions;
  }

  // ── RÉSERVATIONS ────────────────────────────────────
  var _reservingId = null;
  function openReservationModal(id) {
    if (!Auth.can('tables.manage')) { Toast.warn('Permission refusée'); return; }
    var t = _tables.find(function(x) { return x.id === id; }); if (!t) return;
    // Cache l'overlay détails pour ne pas avoir 2 modales empilées
    var ov = document.getElementById('tables-details-overlay');
    if (ov) ov.classList.remove('open');
    _reservingId = id;
    var nameEl = document.getElementById('rm-table-name'); if (nameEl) nameEl.textContent = t.nom || ('Table ' + t.id);
    document.getElementById('rm-client').value = ''; document.getElementById('rm-phone').value = '';
    document.getElementById('rm-couverts').value = t.capacite || 2; document.getElementById('rm-notes').value = '';
    var d = new Date(Date.now() + 3600000); d.setSeconds(0, 0);
    document.getElementById('rm-datetime').value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    Modal.open('modal-reserve-table');
  }
  function cancelReservationModal() { Modal.close('modal-reserve-table'); _reservingId = null; }
  async function confirmReservation() {
    if (!_reservingId) return;
    var payload = { client_name: document.getElementById('rm-client').value.trim(), phone: document.getElementById('rm-phone').value.trim(), nb_couverts: parseInt(document.getElementById('rm-couverts').value) || 2, date_time: document.getElementById('rm-datetime').value, notes: document.getElementById('rm-notes').value.trim() };
    if (!payload.client_name) { Toast.warn('Nom du client requis'); return; }
    if (!payload.date_time) { Toast.warn('Date et heure requises'); return; }
    var btn = document.querySelector('#modal-reserve-table .btn-primary'); if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    var r = await API.reserveTable(_reservingId, payload);
    if (btn) { btn.disabled = false; btn.textContent = '📅 Réserver'; }
    if (r && r.success) { Toast.success('Réservation enregistrée'); Modal.close('modal-reserve-table'); _reservingId = null; await render(); } else Toast.error((r && r.error) || 'Erreur');
  }
  async function cancelReservation(id) { if (!confirm('Annuler la réservation ?')) return; var r = await API.cancelReservation(id); if (r && r.success) { Toast.success('Réservation annulée'); await render(); } else Toast.error((r && r.error) || 'Erreur'); }

  function promptTransfer(id) { var dest = parseInt(prompt('Transférer vers la table N° ?')); if (isNaN(dest) || dest === id) return; API.transferTable(id, dest).then(function(r) { if (r && r.success) { Toast.success('Table transférée'); render(); } else Toast.error((r && r.error) || 'Erreur'); }); }
  function printBill(id) { Toast.info && Toast.info('Impression…'); window.print(); }
  function closeFromPanel(id) { if (!confirm('Fermer cette table (sans encaissement) ?')) return; API.closeTable(id).then(function(r) { if (r && r.success) { Toast.success('Table fermée'); delete _sessions[id]; cancelSelection(); render(); } else Toast.error((r && r.error) || 'Erreur'); }); }

  function _timeSince(dateStr) { if (!dateStr) return ''; var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000); if (diff < 1) return "à l'instant"; if (diff < 60) return diff + ' min'; var h = Math.floor(diff / 60); return h + 'h' + (diff % 60).toString().padStart(2, '0'); }

  // ── Drag and drop (CORRIGÉ : delta direct en % sans scale) ──
  var _drag = { card: null, floorEl: null, startX: 0, startY: 0, startPctX: 0, startPctY: 0, floorRect: null, snap: true, axis: null, AXIS_THRESHOLD: 6, scale: 1 };
  var _dragListenersAttached = false, _rafPending = false, _lastEvent = null;

  var _resize = { card: null, startX: 0, startY: 0, startW: 0, startH: 0, MIN: 60, MAX: 280, scale: 1 };

  function _updateDragPosition() {
    if (!_drag.card || !_lastEvent) return;
    var e = _lastEvent;
    var dxScreen = e.clientX - _drag.startX;
    var dyScreen = e.clientY - _drag.startY;

    if (!_drag.axis) {
      var absDx = Math.abs(dxScreen), absDy = Math.abs(dyScreen);
      if (absDx < _drag.AXIS_THRESHOLD && absDy < _drag.AXIS_THRESHOLD) return;
      _drag.axis = absDx >= absDy ? 'x' : 'y';
      _drag.card.classList.add('axis-' + _drag.axis);
    }

    var pctX = _drag.startPctX, pctY = _drag.startPctY;
    
    // Calcul direct : delta écran / taille réelle du wrapper = delta en %
    if (_drag.axis === 'x') { pctX += (dxScreen / _drag.floorRect.width) * 100; }
    else { pctY += (dyScreen / _drag.floorRect.height) * 100; }

    if (_drag.snap) {
      var snapPctX = (50 / FLOOR_W) * 100;
      var snapPctY = (50 / FLOOR_H) * 100;
      pctX = Math.round(pctX / snapPctX) * snapPctX;
      pctY = Math.round(pctY / snapPctY) * snapPctY;
    }
    
    // Constraints stricts pour ne JAMAIS dépasser le conteneur
    var wPx = _drag.card.offsetWidth || 100;
    var hPx = _drag.card.offsetHeight || 100;
    var wPct = (wPx / _drag.floorRect.width) * 100;
    var hPct = (hPx / _drag.floorRect.height) * 100;
    
    pctX = Math.max(0, Math.min(100 - wPct, pctX));
    pctY = Math.max(0, Math.min(100 - hPct, pctY));

    _drag.card.style.left = pctX + '%';
    _drag.card.style.top = pctY + '%';
    
    var prev = _dirty[_drag.card.dataset.id] || {};
    prev.x = pctX; prev.y = pctY;
    _dirty[_drag.card.dataset.id] = prev;
    _detectCollisions();

    var info = document.getElementById('floor-info');
    if (info) info.textContent = (_drag.axis === 'x' ? '↔ horizontal' : '↕ vertical') + ' · ' + Math.round(pctX) + '% , ' + Math.round(pctY) + '% — ' + Object.keys(_dirty).length + ' modifiée(s)';
  }

  function _frameUpdate() { _rafPending = false; if (_drag.card) _updateDragPosition(); if (_resize.card) _updateResize(); }

  function _attachGlobalDragListeners() {
    if (_dragListenersAttached) return;
    document.addEventListener('mousemove', function(e) {
      if (!_editing) return; if (!_drag.card && !_resize.card) return;
      _lastEvent = e;
      if (!_rafPending) { _rafPending = true; requestAnimationFrame(_frameUpdate); }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mouseup', function() {
      if (!_drag.card && !_resize.card) return;
      if (_drag.card) { _drag.card.classList.remove('dragging', 'axis-x', 'axis-y'); _drag.card.style.transition = ''; var ch = _drag.card.querySelectorAll('*'); for (var i=0; i<ch.length; i++) ch[i].style.pointerEvents = ''; _drag.card = null; _drag.axis = null; }
      if (_resize.card) {
        _resize.card.classList.remove('resizing');
        _resize.card = null;
        _resize.startRect = null; // CORRECTION : Reset du rect
      }
      var tip = document.getElementById('resize-tooltip'); if (tip) tip.style.display = 'none';
      _lastEvent = null;
      var info = document.getElementById('floor-info'); if (info) info.textContent = '✏ ' + Object.keys(_dirty).length + ' table(s) modifiée(s) — clique sur "Sauvegarder"';
      _renderHeaderActions();
    });
    document.addEventListener('selectstart', function(e) { if (_drag.card) e.preventDefault(); });
    _dragListenersAttached = true;
  }

  function _updateResize() {
    if (!_resize.card || !_lastEvent) return;
    var e = _lastEvent;
    
    // Delta de la souris converti directement en % du floor
    var dx = (e.clientX - _resize.startX) / _resize.floorRect.width * 100;
    var dy = (e.clientY - _resize.startY) / _resize.floorRect.height * 100;
    
    var minPctW = (12 / _resize.floorRect.width) * 100;  // ~12px minimum
    var minPctH = (12 / _resize.floorRect.height) * 100;
    
    // On ajoute le delta en % à la taille de départ en %
    var newW = Math.max(minPctW, _resize.startPctW + dx);
    var newH = Math.max(minPctH, _resize.startPctH + dy);
    
    // Appliquer en % (plus de px)
    _resize.card.style.width  = newW + '%';
    _resize.card.style.height = newH + '%';
    _resize.card.setAttribute('data-custom-size', '1');
    
    // Chaises s'adaptent
    var sh = _resize.card.getAttribute('data-shape');
    if (sh === 'round') {
      _setRoundChairRadius(_resize.card);
    } else if (!_resize.card.classList.contains('is-wall')) {
      _setRectChairs(_resize.card);
    }
    
    var id = _resize.card.dataset.id;
    var prev = _dirty[id] || {};
    prev.width_pct = newW; // Sauvegarde en % pour éviter les bugs de scale
    prev.height_pct = newH;
    _dirty[id] = prev;
    
    // Tooltip (on convertit le % en px juste pour l'affichage)
    var tip = document.getElementById('resize-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'resize-tooltip';
      tip.className = 'resize-tooltip';
      document.body.appendChild(tip);
    }
    tip.textContent = Math.round(newW / 100 * _resize.floorRect.width) + 'x' + Math.round(newH / 100 * _resize.floorRect.height);
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY + 14) + 'px';
    tip.style.display = 'block';
  }

  var _kbdEditTarget = null, _kbdHandlerAttached = false;
  function _onKbdMove(e) {
    if (!_editing || !_kbdEditTarget) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    var step = e.shiftKey ? 2 : 0.5;
    var card = document.querySelector('.table-card[data-id="' + _kbdEditTarget + '"]'); if (!card) return;
    var x = parseFloat(card.style.left) || 50, y = parseFloat(card.style.top) || 50, moved = false;
    if (e.key === 'ArrowLeft') { x = Math.max(0, x - step); moved = true; }
    if (e.key === 'ArrowRight') { x = Math.min(100, x + step); moved = true; }
    if (e.key === 'ArrowUp') { y = Math.max(0, y - step); moved = true; }
    if (e.key === 'ArrowDown') { y = Math.min(100, y + step); moved = true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (confirm('Supprimer cette table ?')) Tables.delete(_kbdEditTarget); return; }
    if (!moved) return; e.preventDefault();
    card.style.left = x + '%'; card.style.top = y + '%';
    var prev = _dirty[_kbdEditTarget] || {}; prev.x = x; prev.y = y; _dirty[_kbdEditTarget] = prev;
    _renderHeaderActions();
    var info = document.getElementById('floor-info'); if (info) info.textContent = '⌨ ' + Math.round(x) + '% , ' + Math.round(y) + '%  ·  ' + Object.keys(_dirty).length + ' modifiée(s)';
  }
  function _attachKbdHandler() { if (_kbdHandlerAttached) return; document.addEventListener('keydown', _onKbdMove); _kbdHandlerAttached = true; }

  function _wireDrag(floorEl) {
    _attachKbdHandler(); _attachGlobalDragListeners();
    floorEl.querySelectorAll('.table-card').forEach(function(card) {
      card.onmousedown = function(e) {
        if (!_editing || e.button !== 0) return;
        var cl = e.target.classList; if (!cl) return;
        if (cl.contains('table-card-del') || cl.contains('table-card-edit') || cl.contains('table-card-rotate')) return;

        // Poignée de RESIZE
          if (cl.contains('table-card-resize')) {
          _resize.card = card;
          _resize.startX = e.clientX;
          _resize.startY = e.clientY;
          
          // Récupérer le rectangle du FLOOR (le parent) pour les calculs en %
          _resize.floorRect = floorEl.getBoundingClientRect();
          
          // Calculer la taille actuelle en % (même si elle est en px dans le style)
          var currentW = card.offsetWidth;
          var currentH = card.offsetHeight;
          _resize.startPctW = (currentW / _resize.floorRect.width) * 100;
          _resize.startPctH = (currentH / _resize.floorRect.height) * 100;
          
          // Min taille permissif : 2px pour murs, 20px pour tables (~très petit)
          _resize.curMin = card.classList.contains('is-wall') ? 2 : 20;
          card.classList.add('resizing');
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        _drag.card = card; _drag.floorEl = floorEl; _drag.floorRect = floorEl.getBoundingClientRect();
        _drag.startX = e.clientX; _drag.startY = e.clientY;
        _drag.startPctX = parseFloat(card.style.left) || 50; _drag.startPctY = parseFloat(card.style.top) || 50;
        _drag.snap = !e.shiftKey; _drag.axis = null;
        _kbdEditTarget = parseInt(card.dataset.id);
        floorEl.querySelectorAll('.table-card.kbd-active').forEach(function(c) { c.classList.remove('kbd-active'); });
        card.classList.add('kbd-active', 'dragging');
        var children = card.querySelectorAll('*'); for (var i = 0; i < children.length; i++) children[i].style.pointerEvents = 'none';
        e.preventDefault(); e.stopPropagation();
      };
    });
  }

  // ── Render principal ────────────────────────────────
  async function render() {
    _renderHeaderActions();
    var data = await API.getTables();
    if (Array.isArray(data) && data.length) {
      _tables = data;

      // ⚡ MUTATE _sessions au lieu de réassigner (préserver export ref)
      Object.keys(_sessions).forEach(function(k) { delete _sessions[k]; });

      // Populer _sessions à partir des sessions_table renvoyées par l'API
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        var sess = (t.sessions_table || []).find(function(s) { return s.statut === 'ouverte'; });
        if (sess) _sessions[t.id] = sess;
      }
    }
    _renderKPI(); _renderZones(); _renderFloor(); _renderSide(); _renderActionbar();
    _renderDesktopListView();  // Vue liste desktop (visible seulement si _viewDesktop === 'list')

    // ⚡ FALLBACK MOBILE BULLETPROOF
    _renderMobileFallback();
  }

  // ── Toggle Plan / Liste sur DESKTOP ────────────────────
  var _viewDesktop = 'plan';
  function setView(v) {
    _viewDesktop = (v === 'list') ? 'list' : 'plan';
    // Toggle visibility
    var floor = document.getElementById('tables-layout-pro');
    var list  = document.getElementById('tables-list-desktop');
    if (floor) floor.style.display = (_viewDesktop === 'plan') ? '' : 'none';
    if (list)  list.style.display  = (_viewDesktop === 'list') ? '' : 'none';
    // Update toggle buttons
    document.querySelectorAll('.tvt-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.view === _viewDesktop);
    });
    _renderDesktopListView();
  }

  function _renderDesktopListView() {
    if (_viewDesktop !== 'list') return;
    var host = document.getElementById('tables-list-desktop');
    if (!host) return;
    var realTables = _tables.filter(function(t) { return t.kind !== 'wall'; });
    var filtered = realTables.filter(_matches);
    // Tri : occupées d'abord, puis nom
    filtered.sort(function(a, b) {
      var sa = _sessions[a.id] ? 0 : (a.statut === 'reservee' ? 1 : 2);
      var sb = _sessions[b.id] ? 0 : (b.statut === 'reservee' ? 1 : 2);
      if (sa !== sb) return sa - sb;
      return (a.nom || '').localeCompare(b.nom || '', undefined, { numeric: true });
    });

    if (!filtered.length) {
      host.innerHTML = '<div class="tld-empty"><div class="tld-empty-icon">🪑</div><div class="tld-empty-title">Aucune table dans cette zone</div></div>';
      return;
    }

    var html = '<div class="tld-grid">';
    filtered.forEach(function(t) {
      var st = _statusOf(t);
      var sess = _sessions[t.id];
      var stLbl = st === 'occupee' ? 'OCCUPÉE' : st === 'reservee' ? 'RÉSERVÉE' : st === 'cleaning' ? 'MÉNAGE' : 'LIBRE';
      var actionLbl = sess ? '📋 Reprendre la commande →' : '+ Ouvrir & commander';
      var info = '';
      if (sess) {
        var total = getTableTotal(t.id);
        info = '<div class="tld-info">'
          + '<span class="tld-pill">⏱ ' + _timeSinceMfb(sess.ouverte_at) + '</span>'
          + '<span class="tld-pill">👥 ' + (sess.nb_couverts || 0) + ' couverts</span>'
          + '<span class="tld-pill">💰 ' + (total > 0 ? total.toFixed(2) + ' DT' : '—') + '</span>'
          + '</div>';
      } else if (t.statut === 'reservee' && t.reservation) {
        var r = t.reservation;
        info = '<div class="tld-info">'
          + '<span class="tld-pill">📅 ' + _formatRTime(r.date_time) + '</span>'
          + '<span class="tld-pill">👤 ' + _esc(r.client_name || '—') + '</span>'
          + '<span class="tld-pill">👥 ' + (r.nb_couverts || 2) + '</span>'
          + '</div>';
      }
      html += '<article class="tld-card" data-id="' + t.id + '" data-status="' + st + '">'
        + '<div class="tld-bar"></div>'
        + '<div class="tld-body">'
        +   '<div class="tld-head">'
        +     '<div><h3 class="tld-name">' + _esc(t.nom || ('Table ' + t.id)) + '</h3>'
        +     '<div class="tld-meta">' + _esc(t.zone || 'Salle') + ' · ' + (t.capacite || 4) + ' places</div></div>'
        +     '<span class="tld-status status-' + st + '">' + stLbl + '</span>'
        +   '</div>'
        +   info
        +   '<button class="tld-btn">' + actionLbl + '</button>'
        + '</div>'
        + '</article>';
    });
    html += '</div>';
    host.innerHTML = html;

    // Wire clicks
    host.querySelectorAll('.tld-card').forEach(function(card) {
      card.addEventListener('click', function() { select(parseInt(card.dataset.id)); });
      var btn = card.querySelector('.tld-btn');
      if (btn) btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(card.dataset.id);
        select(id);
        setTimeout(function() {
          if (typeof actionSelected === 'function') actionSelected();
        }, 50);
      });
    });
  }

  // Fallback mobile intégré (zéro dépendance externe)
  // Vue par défaut : PLAN VISUEL (avec positionnement absolu adapté au mobile)
  // Toggle vers vue Liste possible.
  function _renderMobileFallback() {
    try {
      if (window.innerWidth > 768) return; // desktop : ne fait rien

      var page = document.getElementById('page-tables');
      if (!page) return;
      var content = page.querySelector('.page-content');
      if (!content) return;

      var host = document.getElementById('mobile-tables-fallback');
      if (!host) {
        host = document.createElement('div');
        host.id = 'mobile-tables-fallback';
        host.className = 'mobile-fallback-shell';
        content.insertBefore(host, content.firstChild);
      }

      var realTables = _tables.filter(function(t) { return t.kind !== 'wall'; });
      var walls      = _tables.filter(function(t) { return t.kind === 'wall'; });
      var zones = ['Toutes'];
      realTables.forEach(function(t) {
        var z = t.zone || 'Salle';
        if (zones.indexOf(z) === -1) zones.push(z);
      });
      var filter = host.getAttribute('data-zone') || 'Toutes';
      var view = host.getAttribute('data-view') || 'plan';   // 'plan' (default) | 'list'
      var search = (host.getAttribute('data-search') || '').toLowerCase();

      // Stats
      var occupied = realTables.filter(function(t){ return _sessions[t.id]; }).length;
      var reserved = realTables.filter(function(t){ return t.statut === 'reservee'; }).length;
      var free     = realTables.length - occupied - reserved;

      // Filter tables
      var visible = realTables.filter(function(t) {
        if (filter !== 'Toutes' && (t.zone || 'Salle') !== filter) return false;
        if (search && (t.nom || ('Table ' + t.id)).toLowerCase().indexOf(search) < 0) return false;
        return true;
      });

      // Render
      var html = '<div class="mfb-stats">'
        + '<div class="mfb-stat"><span class="mfb-stat-val">' + realTables.length + '</span><span class="mfb-stat-lbl">Total</span></div>'
        + '<div class="mfb-stat occ"><span class="mfb-stat-val">' + occupied + '</span><span class="mfb-stat-lbl">Occupées</span></div>'
        + '<div class="mfb-stat res"><span class="mfb-stat-val">' + reserved + '</span><span class="mfb-stat-lbl">Réservées</span></div>'
        + '<div class="mfb-stat free"><span class="mfb-stat-val">' + free + '</span><span class="mfb-stat-lbl">Libres</span></div>'
        + '</div>';

      // View toggle
      html += '<div class="mfb-view-toggle">'
        + '<button class="mfb-vt-btn' + (view === 'plan' ? ' active' : '') + '" data-view="plan">🗺 Plan</button>'
        + '<button class="mfb-vt-btn' + (view === 'list' ? ' active' : '') + '" data-view="list">📋 Liste</button>'
        + '</div>';

      // Search (visible seulement en mode liste)
      if (view === 'list') {
        html += '<div class="mfb-search"><input type="search" placeholder="🔍 Rechercher une table…" id="mfb-search-input" value="' + _esc(search) + '"></div>';
      }

      // Zones
      html += '<div class="mfb-zones">';
      zones.forEach(function(z) {
        var count = z === 'Toutes' ? realTables.length : realTables.filter(function(t){ return (t.zone || 'Salle') === z; }).length;
        html += '<button class="mfb-zone' + (z === filter ? ' active' : '') + '" data-zone="' + _esc(z) + '">' + _esc(z) + ' <span>' + count + '</span></button>';
      });
      html += '</div>';

      if (!visible.length) {
        html += '<div class="mfb-empty"><div class="mfb-empty-icon">🪑</div><div>Aucune table</div></div>';
      } else if (view === 'plan') {
        // ── VUE PLAN VISUEL ─────────────────────────────────
        html += _renderPlanView(visible, walls);
      } else {
        // ── VUE LISTE ───────────────────────────────────────
        html += _renderListView(visible);
      }

      host.innerHTML = html;
      _wirePlanInteractions(host, view);
    } catch (err) {
      console.error('[MobileFallback] crash:', err);
      var content2 = document.querySelector('#page-tables .page-content');
      if (content2) {
        content2.innerHTML = '<div style="padding:20px;color:#dc2626;font-size:13px;font-family:monospace;white-space:pre-wrap">' +
          '⚠ Erreur mobile fallback :\n' + (err.message || err) + '</div>';
      }
    }
  }

  // ── VUE PLAN : reproduit le plan visuel mais adapté mobile
  function _renderPlanView(tables, walls) {
    var html = '<div class="mfb-plan-wrap">';
    html += '<div class="mfb-plan" id="mfb-plan">';
    // Murs (positionnés)
    walls.forEach(function(w) {
      var wx = (w.x != null ? parseFloat(w.x) : 0);
      var wy = (w.y != null ? parseFloat(w.y) : 0);
      if (wx < 0 || wx > 100 || wy < 0 || wy > 100) return; // skip hors zone
      html += '<div class="mfb-pl-wall" style="left:' + wx + '%;top:' + wy + '%"></div>';
    });
    // Tables (positionnées)
    tables.forEach(function(t) {
      var tx = (t.x != null ? parseFloat(t.x) : 50);
      var ty = (t.y != null ? parseFloat(t.y) : 50);
      // Clamp position dans 5-90% pour éviter sortie de viewport mobile
      tx = Math.max(2, Math.min(88, tx));
      ty = Math.max(2, Math.min(88, ty));
      var st = _statusOf(t);
      var sess = _sessions[t.id];
      var miniInfo = '';
      if (sess) {
        var total = getTableTotal(t.id);
        miniInfo = '<div class="mfb-pl-mini">' + (total > 0 ? total.toFixed(0) + ' DT' : '—') + '</div>';
      } else if (t.statut === 'reservee') {
        miniInfo = '<div class="mfb-pl-mini">📅</div>';
      }
      html += '<button class="mfb-pl-table status-' + st + '" data-id="' + t.id + '"'
        + ' style="left:' + tx + '%;top:' + ty + '%">'
        + '<div class="mfb-pl-name">' + _esc((t.nom || ('T' + t.id)).replace(/^Table\s*/i, 'T-')) + '</div>'
        + '<div class="mfb-pl-cap">' + (t.capacite || 4) + 'p</div>'
        + miniInfo
        + '</button>';
    });
    html += '</div></div>';
    html += '<div class="mfb-plan-legend">'
      + '<span class="mfb-pll lib"><span class="mfb-pll-dot"></span>Libre</span>'
      + '<span class="mfb-pll occ"><span class="mfb-pll-dot"></span>Occupée</span>'
      + '<span class="mfb-pll res"><span class="mfb-pll-dot"></span>Réservée</span>'
      + '</div>';
    return html;
  }

  // ── VUE LISTE ───────────────────────────────────────
  function _renderListView(tables) {
    var sorted = tables.slice().sort(function(a, b) {
      var sa = _sessions[a.id] ? 0 : (a.statut === 'reservee' ? 1 : 2);
      var sb = _sessions[b.id] ? 0 : (b.statut === 'reservee' ? 1 : 2);
      if (sa !== sb) return sa - sb;
      return (a.nom || '').localeCompare(b.nom || '', undefined, { numeric: true });
    });
    var html = '<div class="mfb-list">';
    sorted.forEach(function(t) {
      var st = _statusOf(t);
      var sess = _sessions[t.id];
      var stLbl = st === 'occupee' ? 'OCCUPÉE' : st === 'reservee' ? 'RÉSERVÉE' : st === 'cleaning' ? 'MÉNAGE' : 'LIBRE';
      var actionLbl = sess ? '📋 Reprendre la commande →' : '+ Ouvrir & commander';
      var meta = (t.zone || 'Salle') + ' · ' + (t.capacite || 4) + ' places';
      var info = '';
      if (sess) {
        var total = getTableTotal(t.id);
        info = '<div class="mfb-info">'
          + '<span class="mfb-pill">⏱ ' + _timeSinceMfb(sess.ouverte_at) + '</span>'
          + '<span class="mfb-pill">💰 ' + (total > 0 ? total.toFixed(2) + ' DT' : '—') + '</span>'
          + '</div>';
      }
      html += '<article class="mfb-card" data-id="' + t.id + '" data-status="' + st + '">'
        + '<div class="mfb-bar"></div>'
        + '<div class="mfb-body">'
        +   '<div class="mfb-head">'
        +     '<div><div class="mfb-name">' + _esc(t.nom || ('Table ' + t.id)) + '</div>'
        +     '<div class="mfb-meta">' + _esc(meta) + '</div></div>'
        +     '<span class="mfb-status status-' + st + '">' + stLbl + '</span>'
        +   '</div>'
        +   info
        +   '<button class="mfb-btn">' + actionLbl + '</button>'
        + '</div>'
        + '</article>';
    });
    html += '</div>';
    return html;
  }

  // ── Wire all events (plan tables + list cards + filters)
  function _wirePlanInteractions(host, view) {
    // View toggle
    host.querySelectorAll('.mfb-vt-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        host.setAttribute('data-view', btn.dataset.view);
        _renderMobileFallback();
      });
    });

    // Zones
    host.querySelectorAll('.mfb-zone').forEach(function(btn) {
      btn.addEventListener('click', function() {
        host.setAttribute('data-zone', btn.dataset.zone);
        _renderMobileFallback();
      });
    });

    // Search (mode liste uniquement)
    var input = document.getElementById('mfb-search-input');
    if (input) {
      var dt = null;
      input.addEventListener('input', function() {
        clearTimeout(dt);
        dt = setTimeout(function() {
          host.setAttribute('data-search', input.value);
          _renderMobileFallback();
        }, 150);
      });
    }

    // Plan : click tables → ouvrir détails
    host.querySelectorAll('.mfb-pl-table').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = parseInt(el.dataset.id);
        select(id);
      });
    });

    // List : click cards
    host.querySelectorAll('.mfb-card').forEach(function(card) {
      card.addEventListener('click', function() {
        select(parseInt(card.dataset.id));
      });
      var btn = card.querySelector('.mfb-btn');
      if (btn) btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(card.dataset.id);
        select(id);
        setTimeout(function() {
          if (typeof actionSelected === 'function') actionSelected();
        }, 50);
      });
    });
  }

  function _timeSinceMfb(d) {
    if (!d) return '';
    var diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return "à l'instant";
    if (diff < 60) return diff + ' min';
    var h = Math.floor(diff / 60);
    return h + 'h' + String(diff % 60).padStart(2, '0');
  }
  function _formatRTime(s) {
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function handleCardClick(ev, id) { if (_editing) return; select(id); }
  function select(id) {
    if (_editing) return;
    var t = _tables.find(function(x) { return x.id === id; }); if (!t || t.kind === 'wall') return;
    _selected = t;
    var floorEl = document.getElementById('tables-grid');
    if (floorEl) { floorEl.querySelectorAll('.table-card.selected').forEach(function(c) { c.classList.remove('selected'); }); var card = floorEl.querySelector('.table-card[data-id="' + id + '"]'); if (card) card.classList.add('selected'); }
    _renderDetailsPanel(); _renderSide();
  }
  function cancelSelection() {
    _selected = null;
    var floorEl = document.getElementById('tables-grid'); if (floorEl) floorEl.querySelectorAll('.table-card.selected').forEach(function(c) { c.classList.remove('selected'); });
    _renderDetailsPanel(); _renderSide();
  }
  // Fermer la modal avec Escape
  (function() {
    if (window._tablesEscBound) return;
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && _selected && !_editing) cancelSelection();
    });
    window._tablesEscBound = true;
  })();

  var _coversChoice = 2;
  async function actionSelected() {
    if (!_selected) return;
    if (_sessions[_selected.id]) { _goToCaisseForSelected(); return; }
    _openCoversModal();
  }

  function _openCoversModal() {
    if (!_selected) return;
    // Cache l'overlay details pendant qu'on ouvre la modal "couverts" (sinon 2 modales empilées)
    var ov = document.getElementById('tables-details-overlay');
    if (ov) ov.classList.remove('open');
    var defaultCovers = _selected.capacite || 2; _coversChoice = defaultCovers;
    var nameEl = document.getElementById('cm-table-name'); if (nameEl) nameEl.textContent = _selected.nom || ('Table ' + _selected.id);
    var input = document.getElementById('cm-input'); if (input) input.value = '';
    var grid = document.getElementById('cm-grid');
    if (grid) {
      grid.querySelectorAll('.cover-chip').forEach(function(b) { b.classList.remove('selected'); if (parseInt(b.dataset.n) === defaultCovers) b.classList.add('selected'); });
      grid.querySelectorAll('.cover-chip').forEach(function(b) { b.onclick = function() { _coversChoice = parseInt(b.dataset.n); grid.querySelectorAll('.cover-chip').forEach(function(x) { x.classList.remove('selected'); }); b.classList.add('selected'); if (input) input.value = ''; }; });
    }
    if (input) { input.oninput = function() { var v = parseInt(input.value); if (!isNaN(v) && v > 0) { _coversChoice = v; if (grid) grid.querySelectorAll('.cover-chip').forEach(function(x) { x.classList.remove('selected'); }); } }; input.onkeydown = function(e) { if (e.key === 'Enter') confirmOpenTable(); }; }
    Modal.open('modal-open-table');
  }
  function cancelOpenTable() { Modal.close('modal-open-table'); }
  async function confirmOpenTable() {
    if (!_selected) { Modal.close('modal-open-table'); return; }
    var nb = parseInt(_coversChoice); if (isNaN(nb) || nb < 1 || nb > 50) { Toast.warn('Nombre invalide'); return; }
    var btn = document.querySelector('#modal-open-table .btn-primary'); if (btn) { btn.disabled = true; btn.textContent = 'Ouverture…'; }
    var r = await API.openTable(_selected.id, nb);
    if (btn) { btn.disabled = false; btn.textContent = 'Ouvrir & commander →'; }
    if (!r || !r.success) { Toast.error((r && r.error) || 'Erreur'); return; }
    _sessions[_selected.id] = r.session; Modal.close('modal-open-table'); _goToCaisseForSelected();
  }
  function _goToCaisseForSelected() {
    if (typeof Caisse !== 'undefined' && Caisse.setTable) Caisse.setTable(_selected.id, (_sessions[_selected.id] || {}).id, _selected.nom || ('Table ' + _selected.id));
    Toast.success('Table ' + (_selected.nom || _selected.id) + ' active');
    // Ferme proprement le modal de détails AVANT de naviguer
    var ov = document.getElementById('tables-details-overlay');
    if (ov) ov.classList.remove('open');
    var panel = document.getElementById('tables-details-panel');
    if (panel) panel.classList.remove('open');
    _selected = null;
    Nav.go('caisse');
  }

  function enterEditMode() {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; }
    _editing = true; _selected = null; _dirty = {};

    // Détecte si beaucoup de tables sont mal placées et propose un auto-arrangement
    var realTables = _tables.filter(function(t) { return t.kind !== 'wall'; });
    var problematic = 0;
    var positions = {};
    realTables.forEach(function(tt) {
      var tx = (tt.x != null ? parseFloat(tt.x) : 50);
      var ty = (tt.y != null ? parseFloat(tt.y) : 50);
      if (tx < 0 || tx > 95 || ty < 0 || ty > 92) { problematic++; return; }
      var key = Math.floor(tx / 10) + '_' + Math.floor(ty / 10);
      if (positions[key]) problematic++;
      positions[key] = true;
    });
    if (realTables.length && (problematic / realTables.length) > 0.3) {
      Toast.warn(problematic + ' tables empilées/hors zone — clique "✨ Auto-organiser" pour les replacer en grille');
    } else {
      Toast.success('Mode édition activé');
    }
    _renderHeaderActions(); _renderFloor(); _renderActionbar();
  }
  async function exitEditMode() {
    // Récupère la taille du floor pour convertir % → px
    var floorEl = document.getElementById('tables-floor-wrap');
    var floorW = floorEl ? floorEl.offsetWidth : 1200;
    var floorH = floorEl ? floorEl.offsetHeight : 800;
    var updates = Object.keys(_dirty).map(function(id) {
      var d = _dirty[id];
      var u = { id: parseInt(id) };
      if (d.x != null)        u.x = d.x;
      if (d.y != null)        u.y = d.y;
      // Resize stocké en % → convertir en px pour le backend
      if (d.width_pct != null)  u.width  = Math.round((d.width_pct  / 100) * floorW);
      if (d.height_pct != null) u.height = Math.round((d.height_pct / 100) * floorH);
      // Compat : si stocké directement en px
      if (d.width != null  && u.width  == null) u.width  = d.width;
      if (d.height != null && u.height == null) u.height = d.height;
      if (d.rotation != null) u.rotation = d.rotation;
      return u;
    });
    console.log('[exitEditMode] updates:', updates);
    if (updates.length) {
      var r = await API.saveTableLayout(updates);
      if (r && r.success) Toast.success('Plan sauvegardé (' + r.updated + ' tables)');
      else Toast.error((r && r.error) || 'Erreur');
    } else {
      Toast.warn('Aucune modification');
    }
    _editing = false; _dirty = {}; await render();
  }
  function cancelEditMode() { _editing = false; _dirty = {}; Toast.warn('Modifications annulées'); render(); }

  function openAddModal() {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; }
    _editingId = null;
    var t = document.getElementById('modal-table-edit-title'); if (t) t.textContent = 'Nouvelle table';
    document.getElementById('te-nom').value = '';
    document.getElementById('te-cap').value = '4';
    document.getElementById('te-zone').value = 'Salle';
    // Cache la section taille pour les nouvelles tables (utiliser le drag pour les redimensionner ensuite)
    var sec = document.getElementById('te-size-section'); if (sec) sec.style.display = 'none';
    Modal.open('modal-table-edit');
  }
  function openEditModal(id) {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; }
    var t = _tables.find(function(x) { return x.id === id; }); if (!t) return;
    // Cache l'overlay détails pour ne pas avoir 2 modales empilées
    var ov = document.getElementById('tables-details-overlay');
    if (ov) ov.classList.remove('open');
    _editingId = id;
    var ti = document.getElementById('modal-table-edit-title'); if (ti) ti.textContent = 'Modifier : ' + (t.nom || 'Table ' + t.id);
    document.getElementById('te-nom').value = t.nom || '';
    document.getElementById('te-cap').value = t.capacite || 4;
    document.getElementById('te-zone').value = t.zone || 'Salle';

    // Pré-remplir la section taille/forme + l'afficher
    var sec = document.getElementById('te-size-section');
    if (sec) sec.style.display = '';
    // Récup la taille actuelle en px (default si null)
    var floorEl = document.getElementById('tables-floor-wrap');
    var floorW = floorEl ? floorEl.offsetWidth : 1200;
    var floorH = floorEl ? floorEl.offsetHeight : 800;
    var defW = t.shape === 'rect' ? 70 : 50;
    var defH = t.shape === 'rect' ? 45 : 50;
    document.getElementById('te-width').value  = t.width  || Math.round((defW / 100) * floorW);
    document.getElementById('te-height').value = t.height || Math.round((defH / 100) * floorH);
    document.getElementById('te-rotation').value = t.rotation || 0;
    // Sélection visuelle du bouton de forme
    var shape = t.shape || 'square';
    document.querySelectorAll('.te-shape-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.shape === shape);
    });
    Modal.open('modal-table-edit');
  }

  // Helper appelé depuis les boutons forme dans la modal
  function setShapeFromModal(shape) {
    document.querySelectorAll('.te-shape-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.shape === shape);
    });
  }
  async function saveEdit() {
    var nom = document.getElementById('te-nom').value.trim();
    var cap = parseInt(document.getElementById('te-cap').value) || 4;
    var zone = document.getElementById('te-zone').value;
    if (!nom) { Toast.warn('Nom requis'); return; }

    var payload = { nom: nom, capacite: cap, zone: zone };
    // En mode édition, on inclut aussi taille/forme/rotation
    if (_editingId) {
      var activeBtn = document.querySelector('.te-shape-btn.active');
      var shape = activeBtn ? activeBtn.dataset.shape : null;
      var w = parseInt(document.getElementById('te-width').value);
      var h = parseInt(document.getElementById('te-height').value);
      var rot = parseInt(document.getElementById('te-rotation').value) || 0;
      if (shape)            payload.shape = shape;
      if (!isNaN(w) && w >= 30 && w <= 600) payload.width  = w;
      if (!isNaN(h) && h >= 30 && h <= 600) payload.height = h;
      payload.rotation = ((rot % 360) + 360) % 360;
    }

    var r = _editingId
      ? await API.updateTable(_editingId, payload)
      : await API.createTable(Object.assign({ x: 50, y: 50, shape: 'square' }, payload));
    if (r && (r.success || r.table)) {
      Toast.success(_editingId ? 'Table modifiée' : 'Table créée');
      Modal.close('modal-table-edit');
      _editingId = null;
      await render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  }
  async function rotate(id) {
    if (!Auth.can('tables.admin')) return; var t = _tables.find(function(x) { return x.id === id; }); if (!t) return;
    var next = (((_dirty[id] && _dirty[id].rotation != null) ? _dirty[id].rotation : (t.rotation || 0)) + 90) % 360;
    var prev = _dirty[id] || {}; prev.rotation = next; _dirty[id] = prev;
    var card = document.querySelector('.table-card[data-id="' + id + '"]'); if (card) card.style.setProperty('--rot', next + 'deg'); _renderHeaderActions();
  }

  async function autoArrangeTables() {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; }
    if (!confirm('Réorganiser automatiquement TOUTES les tables ?\n\nLe nouveau plan sera sauvegardé immédiatement.')) return;

    var realTables = _tables.filter(function(t) { return t.kind !== 'wall'; });
    var walls      = _tables.filter(function(t) { return t.kind === 'wall'; });
    if (!realTables.length) { Toast.warn('Aucune table'); return; }

    // Grille propre : 6 cols × N rows, dans [3%, 95%] horizontal, [3%, 92%] vertical
    // Espacement : ~15% horizontal, ~13% vertical
    var COLS = 6;
    var STEP_X = 15.0;     // 6 colonnes × 15% = 90% + 3% début → tient dans 0-95
    var STEP_Y = 13.0;
    var START_X = 4;
    var START_Y = 4;

    // Tri par zone puis nom (numérique)
    var byZone = {};
    realTables.forEach(function(t) { var z = t.zone || 'Salle'; if (!byZone[z]) byZone[z] = []; byZone[z].push(t); });

    var floorEl = document.getElementById('tables-floor-wrap');
    var floorW = floorEl ? floorEl.offsetWidth : 1200;
    var floorH = floorEl ? floorEl.offsetHeight : 800;
    // Tailles uniformes : ~12% large, ~10% haut
    var uniformW = Math.round(floorW * 0.12);
    var uniformH = Math.round(floorH * 0.10);

    var currentRow = 0;
    Object.keys(byZone).sort().forEach(function(zone) {
      var arr = byZone[zone].slice().sort(function(a, b) {
        var na = (a.nom || 'Table ' + a.id), nb = (b.nom || 'Table ' + b.id);
        return na.localeCompare(nb, undefined, { numeric: true });
      });
      arr.forEach(function(t, i) {
        var col = i % COLS;
        var row = currentRow + Math.floor(i / COLS);
        var x = START_X + col * STEP_X;
        var y = START_Y + row * STEP_Y;
        _dirty[t.id] = Object.assign(_dirty[t.id] || {}, {
          x: x, y: y, width: uniformW, height: uniformH
        });
      });
      currentRow += Math.ceil(arr.length / COLS) + 1;  // +1 ligne de séparation entre zones
    });

    // Murs : on les pousse hors zone (x: -999) pour les cacher du plan auto-arrangé
    walls.forEach(function(w) {
      _dirty[w.id] = Object.assign(_dirty[w.id] || {}, { x: -999, y: -999 });
    });

    // ⚡ Sauvegarde IMMÉDIATE (pas besoin de cliquer "Sauvegarder")
    Toast.success('Réorganisation… sauvegarde en cours');
    var updates = Object.keys(_dirty).map(function(id) {
      var d = _dirty[id];
      var u = { id: parseInt(id) };
      if (d.x != null)      u.x = d.x;
      if (d.y != null)      u.y = d.y;
      if (d.width != null)  u.width  = d.width;
      if (d.height != null) u.height = d.height;
      if (d.rotation != null) u.rotation = d.rotation;
      return u;
    });
    try {
      var r = await API.saveTableLayout(updates);
      if (r && r.success) {
        Toast.success('Plan sauvegardé (' + r.updated + ' tables)');
        _editing = false;
        _dirty = {};
        await render();
      } else {
        Toast.error((r && r.error) || 'Erreur de sauvegarde');
      }
    } catch (e) {
      console.error('[Tables] auto-arrange save:', e);
      Toast.error('Erreur de sauvegarde');
    }
  }

  function _detectCollisions() {
    var cards = document.querySelectorAll('.table-card.is-table'); if (cards.length < 2) return;
    cards.forEach(function(c) { c.classList.remove('collision'); });
    var rects = []; cards.forEach(function(c) { rects.push({ el: c, r: c.getBoundingClientRect() }); });
    for (var i = 0; i < rects.length; i++) { for (var j = i + 1; j < rects.length; j++) { var a = rects[i].r, b = rects[j].r; if ((Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))) > 200) { rects[i].el.classList.add('collision'); rects[j].el.classList.add('collision'); } } }
  }

  async function addWall() {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; }
    var r = await API.createTable({ nom: 'Mur', capacite: 0, zone: 'Salle', x: 50, y: 50, shape: 'rect', width: 140, height: 20, kind: 'wall' });
    if (r && (r.success || r.table)) { Toast.success('Mur ajouté'); await render(); } else Toast.error((r && r.error) || 'Erreur');
  }

  async function cycleShape(id) {
    if (!Auth.can('tables.admin')) return; var t = _tables.find(function(x) { return x.id === id; }); if (!t) return;
    var order = ['square', 'rect', 'round'], next = order[(order.indexOf(t.shape || 'square') + 1) % order.length];
    t.shape = next; var card = document.querySelector('.table-card[data-id="' + id + '"]'); if (card) card.setAttribute('data-shape', next);
    var r = await API.updateTable(id, { shape: next });
    if (!r || !r.success) { Toast.error((r && r.error) || 'Erreur'); t.shape = order[(order.indexOf(next) + 2) % order.length]; if (card) card.setAttribute('data-shape', t.shape); } else Toast.success('Forme : ' + next);
  }

  async function deleteTable(id) {
    if (!Auth.can('tables.admin')) { Toast.warn('Permission refusée'); return; } var t = _tables.find(function(x) { return x.id === id; }); if (!t || !confirm('Supprimer "' + (t.nom || 'Table ' + id) + '" ?')) return;
    var r = await API.deleteTable(id); if (r && r.success) { Toast.success('Table supprimée'); await render(); } else Toast.error((r && r.error) || 'Erreur');
  }

  function setZone(z) { _zone = z; _renderZones(); _renderFloor(); }
  function _load() { _loadLocal(); }

  return {
    render: render, _load: _load, select: select, handleCardClick: handleCardClick, cancelSelection: cancelSelection, actionSelected: actionSelected,
    confirmOpenTable: confirmOpenTable, cancelOpenTable: cancelOpenTable, setZone: setZone, setSearch: setSearch,
    promptTransfer: promptTransfer, printBill: printBill, closeFromPanel: closeFromPanel,
    openReservationModal: openReservationModal, cancelReservationModal: cancelReservationModal, confirmReservation: confirmReservation, cancelReservation: cancelReservation,
    enterEditMode: enterEditMode, exitEditMode: exitEditMode, cancelEditMode: cancelEditMode,
    openAddModal: openAddModal, openEditModal: openEditModal, saveEdit: saveEdit, setShapeFromModal: setShapeFromModal, cycleShape: cycleShape, rotate: rotate, setView: setView,
    addWall: addWall, autoArrangeTables: autoArrangeTables, delete: deleteTable,
    savePanier: savePanier, clearPanier: clearPanier, getTableTotal: getTableTotal, getTableCount: getTableCount,
    _paniers: _paniers, _sessions: _sessions,
    _getTables: function() { return _tables; }, _getSessions: function() { return _sessions; },
  };
})();