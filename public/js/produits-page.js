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
    var rupture = false, bas = false, stockBadge = '';
    if (tracked) {
      var stock = parseFloat(p.stock != null ? p.stock : p.stock_actuel || 0);
      var seuil = parseFloat(p.seuil != null ? p.seuil : p.seuil_minimum || 5);
      rupture = stock <= 0;
      bas = !rupture && stock < seuil;
      var cls = rupture ? 'badge-red' : bas ? 'badge-orange' : 'badge-green';
      stockBadge = '<span class="badge ' + cls + '">📦 ' + (rupture ? '⚠ Rupture' : stock + ' en stock') + '</span>';
    } else {
      stockBadge = '<span class="badge badge-neutral" style="opacity:.65">stock non suivi</span>';
    }

    // Carte style Green Grounds Coffee : image + nom + prix + actions
    var img = (typeof ProductImages !== 'undefined') ? ProductImages.render(p) : { html: '☕', bg: '#efe6d3' };
    var classes = 'product-btn product-btn-manage' + (rupture ? ' rupture' : '') + (p.actif === false ? ' inactif' : '');

    var actions = canEdit
      ? '<div class="prod-actions-row">' +
          '<button class="btn btn-secondary btn-sm" title="Changer la photo" onclick="event.stopPropagation();Produits.changePhoto(' + p.id + ')">📷</button>' +
          '<button class="btn btn-primary btn-sm" title="Modifier le produit" onclick="event.stopPropagation();Produits.edit(' + p.id + ')">✎</button>' +
          '<button class="btn btn-danger btn-sm" title="Supprimer" onclick="event.stopPropagation();Produits.remove(' + p.id + ')">🗑</button>' +
        '</div>'
      : '';

    return '<div class="' + classes + '" data-product-id="' + p.id + '">' +
      '<div class="product-img" style="background:' + img.bg + '">' +
        img.html +
      '</div>' +
      '<div class="product-info">' +
        '<div>' +
          '<div class="product-name">' + p.nom + '</div>' +
          '<div class="product-price">' + parseFloat(p.prix).toFixed(3) + ' DT</div>' +
          '<div style="margin-top:6px">' + stockBadge + '</div>' +
        '</div>' +
        actions +
      '</div>' +
    '</div>';
  }

  function _renderHeader() {
    var el = document.getElementById('produits-actions');
    if (!el) return;
    el.innerHTML = Auth.can('products.edit')
      ? '<button class="btn btn-primary btn-sm" onclick="Admin.openAddProduct && Admin.openAddProduct()">+ Nouveau produit</button>'
      + '<button class="btn btn-secondary btn-sm" onclick="Admin.openAddCategory && Admin.openAddCategory()">+ Catégorie</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="Admin.openCategoriesManager && Admin.openCategoriesManager()" title="Renommer / supprimer / réorganiser">📂 Gérer catégories</button>'
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

  var _famMap = {};   // { categoryName: familyName }
  var _famList = [];

  async function _loadFamilies() {
    try {
      var f = await API.getFamilies();
      _famMap  = (f && f.mapping)  || {};
      _famList = (f && f.families) || [];
    } catch (_) { _famMap = {}; _famList = []; }
  }

  function _familyOf(cat) {
    if (!cat) return null;
    if (_famMap[cat]) return _famMap[cat];
    var low = cat.toLowerCase();
    for (var k in _famMap) if (k.toLowerCase() === low) return _famMap[k];
    return null;
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

    // Groupement à 2 niveaux : Famille → Catégories → Produits
    var byFam = {};       // { family: { cat: [products] } }
    filtered.forEach(function(p) {
      var cat = p.cat || p.categorie || 'Autres';
      var fam = _familyOf(cat) || '— Sans famille';
      if (!byFam[fam]) byFam[fam] = {};
      if (!byFam[fam][cat]) byFam[fam][cat] = [];
      byFam[fam][cat].push(p);
    });

    // Ordre des familles : celles du backend en premier, puis orphelines
    var famNames = _famList.slice();
    Object.keys(byFam).forEach(function(f) { if (famNames.indexOf(f) < 0) famNames.push(f); });

    var html = '';
    famNames.forEach(function(fam) {
      if (!byFam[fam]) return;
      var cats = Object.keys(byFam[fam]).sort();
      var totalCount = cats.reduce(function(s, c) { return s + byFam[fam][c].length; }, 0);
      var isOrphan = fam === '— Sans famille';
      html += '<div class="family-block' + (isOrphan ? ' family-orphan' : '') + '">'
            + '  <div class="family-header">'
            + '    <span class="family-icon">' + (isOrphan ? '⚠' : '📁') + '</span>'
            + '    <span class="family-title">' + fam + '</span>'
            + '    <span class="family-count">' + totalCount + ' produit' + (totalCount > 1 ? 's' : '') + '</span>'
            + '  </div>';
      cats.forEach(function(cat) {
        var items = byFam[fam][cat].sort(function(a, b) { return (a.nom || '').localeCompare(b.nom || ''); });
        var color = (Store.CAT_COLORS && Store.CAT_COLORS[cat]) || '#888';
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
      html += '</div>';
    });
    root.innerHTML = html;
  }

  async function render() {
    _renderHeader();
    _wireSearch();
    await _loadFamilies();
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

  function edit(id) {
    var p = Store.getProduit(id);
    if (!p) { Toast.warn('Produit introuvable'); return; }
    if (Admin && Admin.openEditProduct) Admin.openEditProduct(p);
  }

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

  // Change la photo d'un produit existant via un file picker volatile
  function changePhoto(id) {
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
              var w = img.width, h = img.height;
              var max = 500;
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
        // PATCH produit
        var r = await API.updateProduit(id, { image_url: j.url });
        if (!r || !r.success) throw new Error((r && r.error) || 'PATCH échoué');
        Store.clearCache();
        await Store.loadProduits({ useCache:false });
        Toast.success('Photo mise à jour');
        render();
        if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
      } catch (e) { Toast.error(e.message || 'Erreur'); }
    };
    input.click();
  }

  return {
    render: render, setCat: setCat,
    toggle: toggle, remove: remove, changePhoto: changePhoto,
    edit: edit,
    appendNewProduct: appendNewProduct, removeFromDom: removeFromDom,
  };
})();
