var Caisse = (function() {
  var _order = [];
  var _filter = 'Tous';
  var _search = '';
  var _tableId = null;
  var _sessionId = null;
  var _tableLabel = null;
  var _isAdmin = false;
  var _loadingProduits = false;   // anti double-load pendant le first render

  var _famMap  = {};   // mapping catégorie → famille
  var _famList = [];   // liste ordonnée des familles
  var _subFilter = null;  // sous-catégorie active quand une famille est sélectionnée

  async function _loadFamilies() {
    try {
      var f = await API.getFamilies();
      _famMap  = (f && f.mapping)  || {};
      _famList = (f && f.families) || [];
    } catch (_) {}
  }

  function _familyOf(cat) {
    if (!cat) return null;
    if (_famMap[cat]) return _famMap[cat];
    var low = cat.toLowerCase();
    for (var k in _famMap) if (k.toLowerCase() === low) return _famMap[k];
    return null;
  }

  function _filteredProducts() {
    return Store.produits.filter(function(p) {
      if (!p.actif) return false;
      var cat = p.cat || p.categorie;
      if (_filter !== 'Tous') {
        if (_famList.indexOf(_filter) >= 0) {
          // Famille : filtre toutes ses sous-cats, sauf si une sous-cat précise est active
          if (_familyOf(cat) !== _filter) return false;
          if (_subFilter && cat !== _subFilter) return false;
        } else {
          // Catégorie isolée (sans famille)
          if (cat !== _filter) return false;
        }
      }
      if (_search && p.nom.toLowerCase().indexOf(_search.toLowerCase()) === -1) return false;
      return true;
    });
  }

  function _renderGrid() {
    var grid = document.getElementById('products-grid');
    if (!grid) return;
    // ⚡ TOUJOURS clear l'initial "Chargement..." dès qu'on entre dans render
    if (grid.querySelector('.loading')) grid.innerHTML = '';
    if (!_tableId) {
      grid.innerHTML = '<div class="caisse-empty-modern" style="grid-column:1/-1">' +
        '<div class="caisse-empty-icon">' +
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/><path d="M9 3v18"/>' +
          '</svg>' +
        '</div>' +
        '<div class="caisse-empty-title">Aucune table sélectionnée</div>' +
        '<div class="caisse-empty-sub">Va dans <strong>Tables</strong> pour ouvrir une table et commencer une commande</div>' +
        '<button class="btn-caisse-cta" onclick="Nav.go(\'tables\')">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>' +
          'Voir les tables' +
        '</button>' +
      '</div>';
      return;
    }
    // Race condition : Store pas encore chargé → on attend + on re-render
    if (!Store._loaded || !Store._loaded.produits) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:60px 20px;text-align:center">' +
        '<div class="spinner" style="margin:0 auto 12px"></div>' +
        '<div style="font-size:14px;color:var(--text3)">Chargement des produits…</div></div>';
      // Déclenche le load et re-render à la fin (une fois)
      if (!_loadingProduits) {
        _loadingProduits = true;
        Store.loadProduits({ useCache: false }).finally(function() {
          _loadingProduits = false;
          _renderGrid();
          _renderFilter();
        });
      }
      return;
    }
    var products = _filteredProducts();
    if (!products.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px"><div style="font-size:28px;opacity:.25;margin-bottom:8px">☕</div>Aucun produit</div>';
      return;
    }
    var html = '';
    // Compteur des produits déjà dans le panier (pour le badge qty cercle)
    var qtyInCart = {};
    for (var k = 0; k < _order.length; k++) qtyInCart[_order[k].id] = _order[k].qty;

    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var rupture = false, bas = false, stockLbl = '';
      if (p.tracked) {
        var stock = parseFloat(p.stock || 0);
        rupture = stock <= 0;
        bas = !rupture && stock < (p.seuil || 0);
        if (rupture) stockLbl = '⚠ Rupture';
        else if (bas) stockLbl = stock + ' en stock';
      }
      var img = (typeof ProductImages !== 'undefined') ? ProductImages.render(p) : { html: '☕', bg: '#efe6d3' };
      var inCart = qtyInCart[p.id] || 0;
      var qtyBadge = inCart > 0 ? '<div class="product-qty-badge">' + inCart + '</div>' : '';
      var stockLine = stockLbl ? '<div class="product-portions">' + stockLbl + '</div>' : '';

      var cls = 'product-btn' + (rupture ? ' rupture' : '') + (p.actif === false ? ' inactif' : '');

      html += '<div class="' + cls + '" onclick="Caisse.add(' + p.id + ')">' +
        '<div class="product-img" style="background:' + img.bg + '">' +
          img.html +
          qtyBadge +
        '</div>' +
        '<div class="product-info">' +
          '<div>' +
            '<div class="product-name">' + p.nom + '</div>' +
            '<div class="product-price">' + p.prix.toFixed(3) + ' DT</div>' +
          '</div>' +
          stockLine +
          '<button class="product-add-btn" onclick="event.stopPropagation();Caisse.add(' + p.id + ')" aria-label="Ajouter">+</button>' +
        '</div>' +
      '</div>';
    }
    grid.innerHTML = html;
  }

  function _renderFilter() {
    var cats = Store.categories();   // inclut "Tous"
    // Construit : Tous + chaque famille + catégories orphelines (sans famille)
    var orphans = cats.filter(function(c) {
      if (c === 'Tous') return false;
      return !_familyOf(c);
    });
    var html = '<button class="cat-btn ' + (_filter === 'Tous' ? 'active' : '') + '" onclick="Caisse.setFilter(\'Tous\')">Tous</button>';
    // Bouton famille = grand groupe
    _famList.forEach(function(fam) {
      var safe = fam.replace(/'/g, "\\'");
      html += '<button class="cat-btn cat-btn-family ' + (_filter === fam ? 'active' : '') + '" onclick="Caisse.setFilter(\'' + safe + '\')">📁 ' + fam + '</button>';
    });
    // Catégories orphelines (pas dans une famille)
    orphans.forEach(function(c) {
      var safe = c.replace(/'/g, "\\'");
      html += '<button class="cat-btn ' + (_filter === c ? 'active' : '') + '" onclick="Caisse.setFilter(\'' + safe + '\')">' + c + '</button>';
    });
    document.getElementById('cat-filter').innerHTML = html;
    _renderCatCards(cats);
  }

  // Cards FAMILLES (Boisson Chaude / Froide / Cake)
  // Active = vert plein, inactive = blanc, badge stock en haut
  function _renderCatCards() {
    var el = document.getElementById('cat-cards-row');
    if (!el) return;
    if (!_famList.length) { el.innerHTML = ''; _renderSubCats(); return; }

    function _illuOf(fam) {
      var f = fam.toLowerCase();
      if (f.indexOf('chaud') >= 0 || f.indexOf('hot') >= 0)  return 'coffee';
      if (f.indexOf('froid') >= 0 || f.indexOf('cold') >= 0) return 'tea';
      if (f.indexOf('cake') >= 0 || f.indexOf('snack') >= 0 || f.indexOf('pâtiss') >= 0 || f.indexOf('patiss') >= 0) return 'snack';
      return 'coffee';
    }

    el.innerHTML = _famList.map(function(fam) {
      var items = Store.produits.filter(function(p) {
        if (!p.actif) return false;
        return _familyOf(p.cat || p.categorie) === fam;
      });
      var nbBas = items.filter(function(p) { return p.tracked && Store.isRupture && Store.isRupture(p); }).length;
      var isActive = (_filter === fam);
      var illu = _illuOf(fam);
      var classes = ['cat-card'];
      if (isActive)  classes.push('active');
      if (nbBas > 0) classes.push('warn');
      var statusLabel = nbBas > 0 ? 'Need to re-stock' : 'Available';
      return '<div class="' + classes.join(' ') + '" data-illu="' + illu + '" onclick="Caisse.setFilter(\'' + fam.replace(/'/g, "\\'") + '\')">' +
        '<span class="cat-card-status">' + statusLabel + '</span>' +
        '<div>' +
          '<div class="cat-card-name">' + fam + '</div>' +
          '<div class="cat-card-count">' + items.length + ' items</div>' +
        '</div>' +
        '<span class="cat-card-illu"></span>' +
      '</div>';
    }).join('');

    _renderSubCats();
  }

  // Mapping couleurs par famille (case-insensitive)
  function _famColorClass(fam) {
    if (!fam) return 'fam-orphan';
    var f = fam.toLowerCase();
    if (f.indexOf('chaud') >= 0 || f.indexOf('hot') >= 0)    return 'fam-hot';
    if (f.indexOf('froid') >= 0 || f.indexOf('cold') >= 0)   return 'fam-cold';
    if (f.indexOf('cake') >= 0  || f.indexOf('pâtiss') >= 0 || f.indexOf('patiss') >= 0 || f.indexOf('snack') >= 0) return 'fam-cake';
    return 'fam-default';
  }

  // Pills sous-catégories : barre verticale colorée + pills
  function _renderSubCats() {
    var sub = document.getElementById('subcat-row');
    if (!sub) return;

    var activeFam = _famList.indexOf(_filter) >= 0 ? _filter : null;
    if (!activeFam) { sub.innerHTML = ''; return; }

    var counts = {};
    Store.produits.forEach(function(p) {
      if (!p.actif) return;
      var c = p.cat || p.categorie || 'Divers';
      if (_familyOf(c) === activeFam) counts[c] = (counts[c] || 0) + 1;
    });
    var subs = Object.keys(counts).sort();
    if (!subs.length) { sub.innerHTML = ''; return; }

    var safeFam  = activeFam.replace(/'/g, "\\'");
    var colorCls = _famColorClass(activeFam);
    var total    = Object.values(counts).reduce(function(s, n) { return s + n; }, 0);

    var html = '<div class="subcat-pills-wrap ' + colorCls + '">';
    html += '<button class="subcat-pill ' + (!_subFilter ? 'active' : '') + '" onclick="Caisse.setSubFilter(null)">'
          + 'Tous <span class="subcat-count">' + total + '</span></button>';
    subs.forEach(function(c) {
      var safe = c.replace(/'/g, "\\'");
      var active = (_subFilter === c);
      html += '<button class="subcat-pill ' + (active ? 'active' : '') + '" onclick="Caisse.setSubInFamily(\'' + safeFam + '\',\'' + safe + '\')">'
            + c + ' <span class="subcat-count">' + counts[c] + '</span></button>';
    });
    html += '</div>';
    sub.innerHTML = html;
  }

  // Sélectionne une catégorie spécifique en contexte famille
  function setSubInFamily(family, category) {
    _filter = family;
    _subFilter = (_subFilter === category) ? null : category;
    _renderFilter();
    _renderGrid();
  }

  function setSubFilter(name) {
    _subFilter = name || null;
    _renderSubCats();
    _renderGrid();
  }

  function _renderSearch() {
    var el = document.getElementById('caisse-search');
    if (!el) return;
    el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
      '<input type="text" placeholder="Rechercher..." value="' + _search + '" oninput="Caisse.setSearch(this.value)" ' + (!_tableId ? 'disabled' : '') + '>';
  }

  function _renderOrder() {
    var el = document.getElementById('order-items');
    var btn = document.getElementById('validate-btn');
    if (!_tableId) {
      el.innerHTML = '<div class="order-empty"><div class="order-empty-icon">📋</div><div>Aucune table selectionnee</div></div>';
      btn.disabled = true;
      var bcx = document.getElementById('validate-close-btn'); if (bcx) bcx.disabled = true;
      _setTotals(0);
      return;
    }
    if (!_order.length) {
      el.innerHTML = '<div class="order-empty"><div class="order-empty-icon">☕</div><div>Selectionnez des produits</div></div>';
      btn.disabled = true;
      _setTotals(0);
      document.getElementById('order-num').textContent = 'N° ' + Store.orderCounter;
      return;
    }
    var canDecrement = (typeof Auth !== 'undefined') && Auth.can && Auth.can('orders.decrement');
    var canDelete    = (typeof Auth !== 'undefined') && Auth.can && Auth.can('users.manage'); // admin/manager

    var html = '';
    for (var i = 0; i < _order.length; i++) {
      var item = _order[i];

      var minusBtn = canDecrement
        ? '<button class="qty-btn" title="Retirer 1 unité" onclick="Caisse.changeQty(' + item.id + ',-1)">−</button>'
        : '';
      var delBtn = canDelete
        ? '<button class="qty-btn qty-btn-del" title="Retirer la ligne" onclick="Caisse.removeProduct(' + item.id + ')">×</button>'
        : '';

      html += '<div class="order-item" data-item-id="' + item.id + '">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="order-item-name">' + item.nom + '</div>' +
          '<div class="order-item-cat">' + item.cat + ' · ' + item.prix.toFixed(3) + ' DT/u</div>' +
        '</div>' +
        '<div class="qty-ctrl">' +
          minusBtn +
          '<span class="qty-num" title="Quantité (non modifiable directement)">' + item.qty + '</span>' +
          '<button class="qty-btn qty-btn-add" title="Ajouter 1 unité" onclick="Caisse.changeQty(' + item.id + ',1)">+</button>' +
        '</div>' + delBtn +
        '<div class="order-item-price">' + (item.prix * item.qty).toFixed(3) + ' DT</div></div>';
    }
    el.innerHTML = html;
    var total = 0;
    for (var j = 0; j < _order.length; j++) total += _order[j].prix * _order[j].qty;
    _setTotals(total);
    document.getElementById('order-num').textContent = 'N° ' + Store.orderCounter;
    btn.disabled = false;
    var bc = document.getElementById('validate-close-btn');
    if (bc) bc.disabled = false;
  }

  function _setTotals(total) {
    document.getElementById('subtotal').textContent = total.toFixed(3) + ' DT';
    document.getElementById('order-total').textContent = total.toFixed(3) + ' DT';
  }

  // Sauvegarder dans le panier de la table
  function _saveToTable() {
    if (_tableId) Tables.savePanier(_tableId, _order);
  }

  function add(id) {
    if (!_tableId) { Toast.warn('Sélectionne d\'abord une table'); return; }
    var p = Store.getProduit(id);
    if (!p) return;
    // ⚠ Politique caisse : on NE BLOQUE JAMAIS — on prévient seulement.
    if (Store.isRupture(p)) { Toast.warn('⚠ Produit en rupture — commande autorisée'); }
    var ex = null;
    for (var i = 0; i < _order.length; i++) { if (_order[i].id === id) { ex = _order[i]; break; } }
    if (ex) ex.qty++;
    else _order.push({ id: p.id, nom: p.nom, prix: p.prix, cat: p.cat, qty: 1 });
    _renderOrder();
    _updateQtyBadge(id);          // maj badge sur la card cliquée
    _saveToTable();
  }

  /** Met à jour le badge quantité d'un produit (haut-droit de sa card) sans tout re-render. */
  function _updateQtyBadge(id) {
    var card = document.querySelector('.product-btn[onclick*="' + id + '"]');
    if (!card) return;
    var imgEl = card.querySelector('.product-img');
    if (!imgEl) return;
    var qty = 0;
    for (var i = 0; i < _order.length; i++) { if (_order[i].id === id) { qty = _order[i].qty; break; } }
    var badge = imgEl.querySelector('.product-qty-badge');
    if (qty > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'product-qty-badge';
        imgEl.appendChild(badge);
      }
      badge.textContent = qty;
    } else if (badge) {
      badge.remove();
    }
  }

  function removeProduct(id) {
    if (!_isAdmin) return;
    var n = [];
    for (var i = 0; i < _order.length; i++) { if (_order[i].id !== id) n.push(_order[i]); }
    _order = n;
    _renderOrder();
    _saveToTable();
    Toast.warn('Produit retire');
  }

  function changeQty(id, delta) {
    var item = null;
    for (var i = 0; i < _order.length; i++) { if (_order[i].id === id) { item = _order[i]; break; } }
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      var n = [];
      for (var j = 0; j < _order.length; j++) { if (_order[j].id !== id) n.push(_order[j]); }
      _order = n;
    }
    _renderOrder();
    _updateQtyBadge(id);
    _saveToTable();
  }

  function clear() { _order = []; _renderOrder(); _saveToTable(); }

  async function valider(opts) {
    opts = opts || {};
    if (!_order.length) { Toast.warn('Panier vide'); return; }
    var total = 0;
    for (var i = 0; i < _order.length; i++) total += _order[i].prix * _order[i].qty;
    var btn  = document.getElementById('validate-btn');
    var btn2 = document.getElementById('validate-close-btn');
    var origText  = btn  ? btn.textContent  : null;
    var origText2 = btn2 ? btn2.textContent : null;
    if (btn)  { btn.disabled  = true; btn.textContent  = 'Validation…'; }
    if (btn2) { btn2.disabled = true; btn2.textContent = 'Validation…'; }

    // Helper: TOUJOURS rétablir les boutons (succès ou erreur)
    function _resetButtons() {
      if (btn)  { btn.disabled  = false; if (origText)  btn.textContent  = origText; }
      if (btn2) { btn2.disabled = false; if (origText2) btn2.textContent = origText2; }
    }

    try {
      var items = [];
      for (var j = 0; j < _order.length; j++) {
        var item = _order[j];
        items.push({ produit_id: item.id, nom: item.nom, prix: item.prix, quantite: item.qty });
      }

      var sid = (_sessionId && _sessionId < 2147483647) ? _sessionId : null;
      var tid = (_tableId && _tableId < 2147483647) ? _tableId : null;
      var payload = { items: items, session_id: sid, table_id: tid };
      if (opts.closeTable) payload.closeTable = true;

      var res = await API.createOrder(payload);
      _resetButtons();

      if (res && res.success) {
        // Vider le panier local de la table après validation RÉUSSIE
        if (typeof Tables !== 'undefined' && Tables.clearPanier && _tableId) Tables.clearPanier(_tableId);
        _order = [];

        try { Store.clearCache(); } catch (_) {}
        try { await Store.loadIngredients({ useCache:false }); } catch (_) {}

        _showReceipt(items, total, res.commande_id);
        Store.orderCounter++;
        if (window.App && App._pollOrdersCount) App._pollOrdersCount();
        if (res.warnings && res.warnings.length) Toast.warn(res.warnings[0]);

        // AUTO-CLOSE table si demandé / si backend l'a fait
        if (res.table_closed || opts.closeTable) {
          Toast.success('Table libérée — ' + total.toFixed(3) + ' DT encaissés');
          clearTable();
          if (typeof Tables !== 'undefined') {
            if (Tables._load) Tables._load();
            if (Tables.render) Tables.render();
          }
        } else {
          Toast.success('Commande validée — ' + total.toFixed(3) + ' DT');
        }
      } else {
        // Erreur serveur — on garde le panier pour que l'utilisateur puisse réessayer
        var msg = (res && res.error) ? res.error : 'Erreur réseau — réessaie';
        Toast.error('Validation échouée : ' + msg);
        console.error('[Caisse.valider] échec', res);
      }
    } catch (err) {
      _resetButtons();
      Toast.error('Erreur inattendue : ' + (err && err.message ? err.message : err));
      console.error('[Caisse.valider] exception', err);
    } finally {
      _resetButtons();   // double-safe
      _renderOrder();
      _renderGrid();
    }
  }

  function _showReceipt(items, total, id) {
    document.getElementById('receipt-date').textContent =
      new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' — N°' + id;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="receipt-item"><span>' + items[i].quantite + 'x ' + items[i].nom + '</span><span>' + (items[i].prix * items[i].quantite).toFixed(3) + ' DT</span></div>';
    }
    document.getElementById('receipt-items').innerHTML = html;
    document.getElementById('receipt-total').textContent = total.toFixed(3) + ' DT';
    Modal.open('modal-receipt');
  }

  function setTable(tableId, sessionId, label) {
    _tableId = tableId;
    _sessionId = sessionId;
    _tableLabel = label;
    _isAdmin = Auth.can('viewAdmin');
    // CHARGER le panier existant — NE JAMAIS le vider
    var panier = Tables._paniers ? Tables._paniers[tableId] : null;
    _order = panier ? JSON.parse(JSON.stringify(panier)) : [];
    _renderTableBadge();
    // Si les produits ne sont pas encore chargés (1er refresh sans cache),
    // on les charge MAINTENANT pour que la grille s'affiche dès l'arrivée sur la caisse.
    if ((!Store._loaded || !Store._loaded.produits) && !_loadingProduits) {
      _loadingProduits = true;
      Store.loadProduits({ useCache: false }).finally(function() {
        _loadingProduits = false;
        _renderGrid();
        _renderFilter();
      });
    }
  }

  function clearTable() {
    _tableId = null;
    _sessionId = null;
    _tableLabel = null;
    _order = [];
    _renderTableBadge();
    _renderOrder();
    _renderGrid();
    _renderSearch();
  }

  function _renderTableBadge() {
    var el = document.getElementById('caisse-table-badge');
    if (!el) return;
    if (_tableLabel) {
      el.innerHTML = '<span class="badge badge-accent" style="cursor:pointer;padding:5px 12px" onclick="Caisse.clearTable()">📋 ' + _tableLabel + ' ×</span>';
    } else {
      el.innerHTML = '<span class="badge" style="background:var(--bg3);color:var(--text3);padding:5px 12px;border:1px dashed var(--border2);cursor:pointer" onclick="Nav.go(\'tables\')">📋 Aucune table</span>';
    }
  }

  async function render() {
    // Chaque étape est isolée — si une plante, les autres tournent
    try { _renderSearch(); } catch (e) { console.warn('[Caisse] _renderSearch', e); }
    try {
      if (!_famList.length) _loadFamilies().finally(function() { try { _renderFilter(); } catch (_) {} });
      _renderFilter();
    } catch (e) { console.warn('[Caisse] _renderFilter', e); }
    try { _renderGrid(); }   catch (e) { console.warn('[Caisse] _renderGrid', e); }
    try { _renderOrder(); }  catch (e) { console.warn('[Caisse] _renderOrder', e); }
    try { _renderTableBadge(); } catch (e) { console.warn('[Caisse] _renderTableBadge', e); }
    var now = new Date();
    var cd = document.getElementById('caisse-date');
    if (cd) cd.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    // cmd-count est géré exclusivement par App._pollOrdersCount() qui fetch l'API
    // (évite l'écrasement par Store.orderCounter qui n'est pas synchronisé).
    // Déclenche un refresh immédiat si l'app est disponible
    try { if (window.App && App._pollOrdersCount) App._pollOrdersCount(); } catch (_) {}
  }

  function setSearch(q) { _search = q; _renderGrid(); }
  function setFilter(c) {
    // Si on clique sur la famille déjà active → on déselectionne (revient à Tous)
    if (c === _filter && _famList.indexOf(c) >= 0) c = 'Tous';
    _filter = c;
    _subFilter = null;        // reset sous-cat quand on change de famille
    _renderFilter();
    _renderGrid();
  }

  function validerEtLiberer() { return valider({ closeTable: true }); }

  // 🛡 AUTO-RENDER : si la page caisse est active et que le grid contient
  //    encore l'initial "Chargement..." après que tout le JS soit chargé,
  //    on force un render. Multiple tentatives pour être sûr.
  function _autoRender() {
    try {
      var page = document.getElementById('page-caisse');
      var grid = document.getElementById('products-grid');
      if (!page || !grid) return;
      // Si la page est active ET qu'on a toujours l'initial loading → render
      if (page.classList.contains('active') && grid.querySelector('.loading')) {
        render();
      }
    } catch (e) { console.warn('[Caisse] auto-render', e); }
  }
  // Plusieurs tentatives pour gérer les cas où App.init() arrive en retard
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(_autoRender, 100);
      setTimeout(_autoRender, 600);
      setTimeout(_autoRender, 1500);
    });
  } else {
    setTimeout(_autoRender, 100);
    setTimeout(_autoRender, 600);
    setTimeout(_autoRender, 1500);
  }

  return {
    render: render, setFilter: setFilter, setSubFilter: setSubFilter,
    setSubInFamily: setSubInFamily, setSearch: setSearch,
    add: add, removeProduct: removeProduct, changeQty: changeQty,
    clear: clear, valider: valider, validerEtLiberer: validerEtLiberer,
    setTable: setTable, clearTable: clearTable
  };
})();