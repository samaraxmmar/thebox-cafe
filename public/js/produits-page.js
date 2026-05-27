/* ══════════════════════════════════════════════════════
   THE BOX — Page Produits (groupés par catégorie)
   - Sections par catégorie avec compteur
   - Recherche live
   - Filtre catégorie
   - Append DOM ciblé après création (pas de re-render complet)
══════════════════════════════════════════════════════ */

var Produits = (function() {
  var _search = '';
  var _cat    = 'Tous';
  var _wired  = false;

  function _matches(p) {
    if (_cat !== 'Tous' && (p.cat || p.categorie) !== _cat) return false;
    if (!_search) return true;
    var q = _search.toLowerCase();
    return ((p.nom || '').toLowerCase().indexOf(q) >= 0)
        || (((p.cat || p.categorie) || '').toLowerCase().indexOf(q) >= 0);
  }

  function _productCard(p) {
    var canEdit = Auth.can('products.edit');
    var tracked = (p.tracked === true) || (p.stock != null && !isNaN(p.stock));
    var stockBadge = '';
    if (tracked) {
      var stock = parseFloat(p.stock != null ? p.stock : p.stock_actuel || 0);
      var seuil = parseFloat(p.seuil != null ? p.seuil : p.seuil_minimum || 5);
      var rupture = stock <= 0;
      var bas = !rupture && stock < seuil;
      var cls = rupture ? 'badge-red' : bas ? 'badge-orange' : 'badge-green';
      stockBadge = '<span class="badge ' + cls + '">📦 ' + (rupture ? '⚠ Rupture' : stock + ' en stock') + '</span>';
    } else {
      stockBadge = '<span class="badge badge-neutral" style="opacity:.65">stock non suivi</span>';
    }

    return '<div class="prod-card" data-product-id="' + p.id + '">' +
      '<div class="prod-card-main">' +
        '<div class="prod-card-name">' + p.nom + '</div>' +
        '<div class="prod-card-meta">' + stockBadge +
          (p.actif === false ? '<span class="badge badge-red">inactif</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="prod-card-price">' + parseFloat(p.prix).toFixed(3) + ' DT</div>' +
      (canEdit ?
        '<div class="prod-card-actions">' +
          '<button class="btn btn-ghost btn-sm" title="' + (p.actif === false ? 'Activer' : 'Désactiver') + '" onclick="Produits.toggle(' + p.id + ',' + (p.actif === false ? 'true' : 'false') + ')">' +
            (p.actif === false ? '✓' : '✕') + '</button>' +
          '<button class="btn btn-danger btn-sm" title="Supprimer" onclick="Produits.remove(' + p.id + ')">🗑</button>' +
        '</div>' : '') +
      '</div>';
  }

  function _renderHeader() {
    var el = document.getElementById('produits-actions');
    if (!el) return;
    el.innerHTML = Auth.can('products.edit')
      ? '<button class="btn btn-primary btn-sm" onclick="Admin.openAddProduct && Admin.openAddProduct()">+ Nouveau produit</button>'
      : '';
  }

  function _renderCatFilter() {
    var el = document.getElementById('produits-cat-filter');
    if (!el) return;
    var cats = new Set();
    (Store.produits || []).forEach(function(p) { cats.add(p.cat || p.categorie || 'Autres'); });
    var all = ['Tous'].concat(Array.from(cats).sort());
    el.innerHTML = all.map(function(c) {
      var active = c === _cat ? 'active' : '';
      return '<button class="cat-btn ' + active + '" onclick="Produits.setCat(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</button>';
    }).join('');
  }

  function _wireSearch() {
    if (_wired) return;
    var s = document.getElementById('produits-search');
    if (s) {
      s.addEventListener('input', function(e) { _search = e.target.value; _renderSections(); });
      _wired = true;
    }
  }

  function _renderSections() {
    var root = document.getElementById('produits-sections');
    if (!root) return;
    var filtered = (Store.produits || []).filter(_matches);

    if (!filtered.length) {
      root.innerHTML = '<div class="empty-state" style="padding:60px 20px">'
        + '<div style="font-size:48px;opacity:.25;margin-bottom:12px">📦</div>'
        + '<div style="font-size:15px;font-weight:600">Aucun produit</div>'
        + '<div style="font-size:13px;color:var(--text3);margin-top:4px">'
        + (_search ? 'Aucun résultat pour "' + _search + '"' : 'Clique sur "+ Nouveau produit" pour commencer')
        + '</div></div>';
      return;
    }

    // Groupement par catégorie
    var byCat = {};
    filtered.forEach(function(p) {
      var c = p.cat || p.categorie || 'Autres';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(p);
    });

    var cats = Object.keys(byCat).sort();
    var html = '';
    cats.forEach(function(cat) {
      var items = byCat[cat].sort(function(a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
      var color = Store.CAT_COLORS[cat] || '#888';
      html += '<section class="cat-section">'
            +   '<div class="cat-section-header">'
            +     '<span class="cat-section-dot" style="background:' + color + '"></span>'
            +     '<span class="cat-section-title">' + cat + '</span>'
            +     '<span class="cat-section-count">' + items.length + '</span>'
            +   '</div>'
            +   '<div class="cat-section-grid">'
            +     items.map(_productCard).join('')
            +   '</div>'
            + '</section>';
    });
    root.innerHTML = html;
  }

  async function render() {
    _renderHeader();
    _wireSearch();
    _renderCatFilter();
    _renderSections();

    // Refresh des données depuis l'API (sans bloquer l'affichage)
    if (Store._loaded && Store._loaded.produits) {
      // déjà chargé : refresh discret en arrière-plan
      Store.loadProduits({ useCache: false }).then(function() {
        _renderCatFilter();
        _renderSections();
      });
    } else {
      await Store.loadProduits({ useCache: false });
      _renderCatFilter();
      _renderSections();
    }
  }

  function setCat(c) { _cat = c; _renderCatFilter(); _renderSections(); }

  /* ── Mises à jour DOM ciblées (perf) ─────────────────── */

  /** Ajoute une carte produit dans la bonne section, sans tout re-render. */
  function appendNewProduct(produit) {
    if (!produit) return;
    // Si l'item courant ne matche pas le filtre, on re-render quand même
    // pour rafraîchir le compteur, sinon append direct.
    var matchFilter = _matches(produit);
    if (!matchFilter) { _renderSections(); _renderCatFilter(); return; }

    var cat = produit.cat || produit.categorie || 'Autres';
    var root = document.getElementById('produits-sections');
    if (!root) return;

    var section = root.querySelector('section.cat-section[data-cat="' + CSS.escape(cat) + '"]');
    if (!section) {
      // Pas de section pour cette cat → re-render complet une fois
      _renderCatFilter();
      _renderSections();
      return;
    }
    var grid = section.querySelector('.cat-section-grid');
    if (grid) {
      var div = document.createElement('div');
      div.innerHTML = _productCard(produit);
      var card = div.firstElementChild;
      if (card) {
        card.classList.add('prod-card-new');
        grid.appendChild(card);
        // Mise à jour compteur
        var counter = section.querySelector('.cat-section-count');
        if (counter) counter.textContent = parseInt(counter.textContent || 0) + 1;
      }
    }
  }

  /** Retire un produit du DOM sans tout re-render. */
  function removeFromDom(id) {
    var root = document.getElementById('produits-sections');
    if (!root) return;
    var card = root.querySelector('[data-product-id="' + id + '"]');
    if (!card) return;
    var section = card.closest('.cat-section');
    card.remove();
    if (section) {
      var counter = section.querySelector('.cat-section-count');
      if (counter) counter.textContent = Math.max(0, parseInt(counter.textContent || 0) - 1);
      // Si vide → retirer la section entière
      if (!section.querySelectorAll('.prod-card').length) section.remove();
    }
  }

  /* ── Actions produits ───────────────────────────────── */

  async function toggle(id, actif) {
    var r = await API.toggleProduit(id, actif);
    if (r && r.success) {
      // Mise à jour optimiste dans Store
      var p = Store.getProduit(id);
      if (p) p.actif = actif;
      Store.clearCache();
      Toast.success(actif ? 'Produit activé' : 'Produit désactivé');
      _renderSections();
      if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
    } else Toast.error((r && r.error) || 'Erreur');
  }

  async function remove(id) {
    var p = Store.getProduit(id);
    var nom = p ? p.nom : 'ce produit';
    if (!confirm('Supprimer DÉFINITIVEMENT "' + nom + '" ?\n\nIRRÉVERSIBLE.')) return;

    // Optimiste : retire immédiatement du DOM
    removeFromDom(id);
    Store.produits = Store.produits.filter(function(x) { return x.id !== id; });
    Store.clearCache();

    var r = await API.deleteProduit(id);
    if (r && r.success) {
      Toast.success('"' + nom + '" supprimé');
      if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
      if (typeof Stock  !== 'undefined' && Stock.render)  Stock.render();
    } else {
      Toast.error((r && r.error) || 'Erreur — rechargement');
      // Rollback : re-charge depuis API
      await Store.loadProduits({ useCache: false });
      _renderSections();
    }
  }

  return {
    render: render, setCat: setCat,
    toggle: toggle, remove: remove,
    appendNewProduct: appendNewProduct, removeFromDom: removeFromDom,
  };
})();
