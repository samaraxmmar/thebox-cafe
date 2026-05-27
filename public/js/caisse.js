var Caisse = (function() {
  var _order = [];
  var _filter = 'Tous';
  var _search = '';
  var _tableId = null;
  var _sessionId = null;
  var _tableLabel = null;
  var _isAdmin = false;

  function _filteredProducts() {
    return Store.produits.filter(function(p) {
      if (!p.actif) return false;
      if (_filter !== 'Tous' && p.cat !== _filter) return false;
      if (_search && p.nom.toLowerCase().indexOf(_search.toLowerCase()) === -1) return false;
      return true;
    });
  }

  function _renderGrid() {
    var grid = document.getElementById('products-grid');
    if (!_tableId) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:60px 20px">' +
        '<div style="font-size:48px;opacity:.2;margin-bottom:16px">📋</div>' +
        '<div style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:8px">Selectionnez une table</div>' +
        '<div style="font-size:13px;color:var(--text3);margin-bottom:20px">Allez dans Tables pour ouvrir une table</div>' +
        '<button class="btn btn-primary" onclick="Nav.go(\'tables\')">🪑 Voir les tables</button></div>';
      return;
    }
    var products = _filteredProducts();
    if (!products.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px"><div style="font-size:28px;opacity:.25;margin-bottom:8px">☕</div>Aucun produit</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var color = Store.CAT_COLORS[p.cat] || '#888';
      var stockLbl = '', rupture = false, bas = false, styleAttr = '';
      if (p.tracked) {
        var stock = parseFloat(p.stock || 0);
        rupture = stock <= 0;
        bas = !rupture && stock < (p.seuil || 0);
        stockLbl = rupture ? '⚠ Rupture' : (stock + ' en stock');
        if (bas) styleAttr = 'style="color:var(--orange);font-weight:600"';
      } else {
        // Produit non suivi : pas d'affichage de stock
        stockLbl = '';
      }
      html += '<button class="product-btn ' + (rupture ? 'rupture' : '') + '" onclick="Caisse.add(' + p.id + ')">' +
        '<div class="product-cat-dot" style="background:' + color + '"></div>' +
        '<div class="product-name">' + p.nom + '</div>' +
        '<div class="product-price">' + p.prix.toFixed(3) + ' DT</div>' +
        (stockLbl ? '<div class="product-portions" ' + styleAttr + '>' + stockLbl + '</div>' : '') +
        '</button>';
    }
    grid.innerHTML = html;
  }

  function _renderFilter() {
    var cats = Store.categories();
    var html = '';
    for (var i = 0; i < cats.length; i++) {
      html += '<button class="cat-btn ' + (cats[i] === _filter ? 'active' : '') + '" onclick="Caisse.setFilter(\'' + cats[i] + '\')">' + cats[i] + '</button>';
    }
    document.getElementById('cat-filter').innerHTML = html;
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
    _saveToTable();
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
    _saveToTable();
  }

  function clear() { _order = []; _renderOrder(); _saveToTable(); }

  async function valider(opts) {
    opts = opts || {};
    if (!_order.length) return;
    var total = 0;
    for (var i = 0; i < _order.length; i++) total += _order[i].prix * _order[i].qty;
    var btn = document.getElementById('validate-btn');
    var btn2 = document.getElementById('validate-close-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Validation...'; }
    if (btn2) btn2.disabled = true;

    var items = [];
    for (var i = 0; i < _order.length; i++) {
      var item = _order[i];
      items.push({ produit_id: item.id, nom: item.nom, prix: item.prix, quantite: item.qty });
    }

    var sid = (_sessionId && _sessionId < 2147483647) ? _sessionId : null;
    var tid = (_tableId && _tableId < 2147483647) ? _tableId : null;
    var payload = { items: items, session_id: sid, table_id: tid };

    var res = await API.createOrder(payload);
    if (btn)  btn.textContent = 'Valider la commande →';
    if (btn2) btn2.disabled = false;

    // Vider le panier local de la table après validation
    if (typeof Tables !== 'undefined' && Tables.clearPanier) Tables.clearPanier(_tableId);
    _order = [];

    if (res && res.success) {
      Store.clearCache();                              // stock a changé
      await Store.loadIngredients({ useCache:false }); // refresh frais
      _showReceipt(items, total, res.commande_id);
      Store.orderCounter++;
      if (res.warnings && res.warnings.length) Toast.warn(res.warnings[0]);

      // AUTO-CLOSE : le backend a déjà libéré la table si autoCloseTable=true.
      // On nettoie l'état frontend et on rafraîchit la page Tables.
      if (res.table_closed) {
        Toast.success('Table libérée — ' + total.toFixed(3) + ' DT encaissés');
        clearTable();
        if (typeof Tables !== 'undefined') {
          if (Tables._load) Tables._load();
          if (Tables.render) Tables.render();
        }
      }
    } else {
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        for (var r = 0; r < it.recette.length; r++) {
          var ing = Store.getIngredient(it.recette[r].ingredient_id);
          if (ing) ing.stock = Math.max(0, ing.stock - it.recette[r].quantite * it.quantite);
        }
      }
      _showReceipt(items, total, Store.orderCounter);
      Store.orderCounter++;
      Toast.warn('Commande enregistree hors ligne');
    }

    _renderOrder();
    _renderGrid();
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

  function render() {
    _renderSearch();
    _renderFilter();
    _renderGrid();
    _renderOrder();
    _renderTableBadge();
    var now = new Date();
    var cd = document.getElementById('caisse-date');
    if (cd) cd.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var cc = document.getElementById('cmd-count');
    if (cc) cc.textContent = (Store.orderCounter - 1) + ' commande(s) aujourd\'hui';
  }

  function setSearch(q) { _search = q; _renderGrid(); }
  function setFilter(c) { _filter = c; _renderFilter(); _renderGrid(); }

  function validerEtLiberer() { return valider({ closeTable: true }); }

  return {
    render: render, setFilter: setFilter, setSearch: setSearch,
    add: add, removeProduct: removeProduct, changeQty: changeQty,
    clear: clear, valider: valider, validerEtLiberer: validerEtLiberer,
    setTable: setTable, clearTable: clearTable
  };
})();