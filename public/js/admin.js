/* ══════════════════════════════════════════════════════
   THE BOX — Admin (legacy page) — gestion produits simple
   Modèle : 1 produit = 1 stock direct, pas de recette.
══════════════════════════════════════════════════════ */

const Admin = {
  render() {
    const content = document.getElementById('admin-content');
    const actions = document.getElementById('admin-actions');

    if (!Auth.can('products.view')) {
      if (actions) actions.innerHTML = '';
      if (content) content.innerHTML = `
        <div class="empty-state" style="padding:60px 20px">
          <div style="font-size:48px;opacity:.3">🔒</div>
          <div style="font-size:16px;font-weight:600;margin-top:12px">Accès restreint</div>
          <div style="font-size:13px;color:var(--text3);margin-top:6px">Permission requise : products.view</div>
        </div>`;
      return;
    }

    if (actions) {
      actions.innerHTML = Auth.can('products.edit')
        ? '<button class="btn btn-primary btn-sm" onclick="Admin.openAddProduct()">+ Nouveau produit</button>'
        : '';
    }

    if (content) {
      content.innerHTML = `
        <div class="card">
          <div class="card-title">Produits</div>
          <div style="margin-top:14px" id="product-list"></div>
        </div>`;
      this._renderList();
    }
  },

  _renderList() {
    const el = document.getElementById('product-list');
    if (!el) return;

    const list = (Store && Store.produits) || [];
    if (!list.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px">Aucun produit — clique sur "+ Nouveau produit"</div>';
      return;
    }

    el.innerHTML = list.map(p => {
      const stock = parseFloat(p.stock || 0);
      const seuil = parseFloat(p.seuil || 5);
      const rupture = stock <= 0;
      const bas = !rupture && stock < seuil;
      const stockCls = rupture ? 'badge-red' : bas ? 'badge-orange' : 'badge-green';
      const stockLbl = rupture ? '⚠ Rupture' : stock + ' en stock';

      return `
        <div class="product-list-item">
          <div style="flex:1;min-width:0">
            <div class="pli-header">
              <span class="pli-name">${p.nom}</span>
              <span class="badge badge-accent" style="margin-left:6px">${p.cat}</span>
              <span class="badge ${stockCls}" style="margin-left:6px">📦 ${stockLbl}</span>
              ${!p.actif ? '<span class="badge badge-red" style="margin-left:6px">Désactivé</span>' : ''}
            </div>
          </div>
          <div class="pli-actions">
            <span class="pli-price">${p.prix.toFixed(3)} DT</span>
            <button class="btn btn-ghost btn-sm" onclick="Admin.toggle(${p.id})">
              ${p.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="Admin.delete(${p.id})">🗑</button>
          </div>
        </div>`;
    }).join('');
  },

  async toggle(id) {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée : products.edit'); return; }
    const p = Store.getProduit(id);
    if (!p) return;
    const newActif = !p.actif;
    const r = await API.toggleProduit(id, newActif);
    if (r && r.success) {
      Store.clearCache();
      await Store.loadProduits({ useCache:false });
      Toast.success(`"${p.nom}" ${newActif ? 'activé' : 'désactivé'}`);
      this._renderList();
      if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  async delete(id) {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée : products.edit'); return; }
    const p = Store.getProduit(id);
    if (!p) return;

    if (!confirm(`Supprimer DÉFINITIVEMENT "${p.nom}" ?\n\nLes lignes de commande associées seront supprimées.\nIrréversible.`)) return;

    const r = await API.deleteProduit(id);
    if (r && r.success) {
      Store.clearCache();
      await Store.loadProduits({ useCache:false });
      Toast.success(`"${p.nom}" supprimé`);
      this._renderList();
      if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
      if (typeof Stock    !== 'undefined' && Stock.render)    Stock.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  openAddProduct() {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée : products.edit'); return; }
    this._editingProductId = null;
    var title = document.querySelector('#modal-product .modal-title');
    if (title) title.textContent = 'Nouveau produit';
    var primaryBtn = document.querySelector('#modal-product .btn-primary');
    if (primaryBtn) primaryBtn.textContent = 'Enregistrer';
    document.getElementById('np-nom').value   = '';
    document.getElementById('np-prix').value  = '';
    const stockEl = document.getElementById('np-stock'); if (stockEl) stockEl.value = '0';
    const coutEl  = document.getElementById('np-cout');  if (coutEl)  coutEl.value  = '';
    const seuilEl = document.getElementById('np-seuil'); if (seuilEl) seuilEl.value = '5';
    const imgEl   = document.getElementById('np-image'); if (imgEl)   imgEl.value   = '';
    const fileEl  = document.getElementById('np-image-file'); if (fileEl) fileEl.value = '';
    var actifEl = document.getElementById('np-actif'); if (actifEl) actifEl.checked = true;
    this._refreshCategorySelect('Boisson chaude');
    this.removeImage();
    Modal.open('modal-product');
  },

  // ── Modifier un produit existant — préfille la modal ──
  openEditProduct(produit) {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée'); return; }
    if (!produit) return;
    this._editingProductId = produit.id;
    var title = document.querySelector('#modal-product .modal-title');
    if (title) title.textContent = 'Modifier : ' + (produit.nom || '');
    var primaryBtn = document.querySelector('#modal-product .btn-primary');
    if (primaryBtn) primaryBtn.textContent = 'Enregistrer les modifications';

    document.getElementById('np-nom').value  = produit.nom || '';
    document.getElementById('np-prix').value = produit.prix != null ? produit.prix : '';
    var stockEl = document.getElementById('np-stock');
    if (stockEl) stockEl.value = (produit.stock != null) ? produit.stock : (produit.stock_actuel != null ? produit.stock_actuel : 0);
    var coutEl  = document.getElementById('np-cout');
    if (coutEl)  coutEl.value  = (produit.cout != null) ? produit.cout : (produit.cout_unitaire != null ? produit.cout_unitaire : '');
    var seuilEl = document.getElementById('np-seuil');
    if (seuilEl) seuilEl.value = (produit.seuil != null) ? produit.seuil : (produit.seuil_minimum != null ? produit.seuil_minimum : 5);
    var imgEl   = document.getElementById('np-image');
    if (imgEl)   imgEl.value   = produit.image_url || '';
    var fileEl  = document.getElementById('np-image-file'); if (fileEl) fileEl.value = '';
    var actifEl = document.getElementById('np-actif'); if (actifEl) actifEl.checked = produit.actif !== false;

    this._refreshCategorySelect(produit.cat || produit.categorie || 'Divers');

    // Preview de la photo si présente
    var preview = document.getElementById('np-image-preview');
    if (preview) {
      if (produit.image_url) {
        preview.innerHTML = '<img src="' + produit.image_url + '" alt="" />';
        var rm = document.getElementById('np-image-remove'); if (rm) rm.style.display = '';
      } else {
        preview.innerHTML = '<span class="img-upload-placeholder">📷 Aucune photo</span>';
        var rm2 = document.getElementById('np-image-remove'); if (rm2) rm2.style.display = 'none';
      }
    }
    Modal.open('modal-product');
  },

  // Rebuild dynamique du <select> des catégories : toutes les catégories existantes
  _refreshCategorySelect(selectedCat) {
    var sel = document.getElementById('np-cat');
    if (!sel) return;
    var cats = new Set(['Boisson chaude', 'Boisson froide', 'Pâtisserie', 'Snack', 'Divers']);
    (Store.produits || []).forEach(function(p) {
      var c = p.cat || p.categorie;
      if (c) cats.add(c);
    });
    var list = Array.from(cats).sort();
    sel.innerHTML = list.map(function(c) {
      var sel2 = c === selectedCat ? ' selected' : '';
      return '<option' + sel2 + '>' + c + '</option>';
    }).join('') + '<option value="__new__">+ Nouvelle catégorie…</option>';
    sel.onchange = function() {
      if (sel.value === '__new__') {
        var n = (prompt('Nom de la nouvelle catégorie :') || '').trim();
        if (!n) { sel.value = selectedCat; return; }
        // Insère et sélectionne
        var opt = document.createElement('option');
        opt.value = n; opt.text = n; opt.selected = true;
        sel.insertBefore(opt, sel.querySelector('option[value="__new__"]'));
      }
    };
  },

  // ── Upload image depuis le PC ───────────────────────
  async handleImageFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { Toast.warn('Choisis un fichier image'); return; }
    if (file.size > 5 * 1024 * 1024)     { Toast.warn('Image trop lourde (max 5 Mo)'); return; }

    const preview = document.getElementById('np-image-preview');
    preview.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      // Resize côté navigateur pour ne pas balancer 4 Mo au serveur
      const dataUrl = await this._resizeImage(file, 500);
      // Upload au serveur → on récupère une URL stable
      const res = await fetch('/api/upload', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ data: dataUrl }),
      });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || 'Upload échoué');

      document.getElementById('np-image').value = j.url;
      preview.innerHTML = '<img src="' + j.url + '" alt="" />';
      document.getElementById('np-image-remove').style.display = '';
      Toast.success('Photo prête');
    } catch (e) {
      preview.innerHTML = '<span class="img-upload-placeholder">📷 Erreur</span>';
      Toast.error(e.message || 'Erreur upload');
    }
  },

  removeImage() {
    const preview = document.getElementById('np-image-preview');
    if (preview) preview.innerHTML = '<span class="img-upload-placeholder">📷 Aucune photo</span>';
    const hidden = document.getElementById('np-image'); if (hidden) hidden.value = '';
    const file   = document.getElementById('np-image-file'); if (file) file.value = '';
    const rm     = document.getElementById('np-image-remove'); if (rm) rm.style.display = 'none';
  },

  // Resize l'image en client → renvoie un data URL JPEG compressé
  _resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Lecture fichier impossible'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image invalide'));
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            const r = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  },
  // Alias utilisé depuis la page Produits
  openProductModal() { return this.openAddProduct(); },

  // ── Gérer les catégories (liste, rename, delete) ─────
  async openCategoriesManager() {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée'); return; }
    var search = document.getElementById('cat-search');
    if (search) search.value = '';
    Modal.open('modal-categories');
    await this.refreshCategoriesList();
  },

  async refreshCategoriesList() {
    var list = document.getElementById('cat-list');
    if (!list) return;
    list.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement…</div>';
    var [cats, famData] = await Promise.all([API.getCategories(), API.getFamilies()]);
    if (!Array.isArray(cats)) { list.innerHTML = '<div class="empty-state">Erreur de chargement</div>'; return; }
    this._catsCache = cats;
    this._famCache = (famData && Array.isArray(famData.families)) ? famData : { families: [], mapping: {} };
    this._renderCategoriesList(cats);
  },

  _renderCategoriesList(cats) {
    var list = document.getElementById('cat-list');
    if (!list) return;
    if (!cats.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px">Aucune catégorie</div>';
      return;
    }
    var families = (this._famCache && this._famCache.families) || [];

    // Groupe les catégories par famille (case-insensitive helper)
    var byFamily = {};
    var orphans = [];
    families.forEach(function(f) { byFamily[f] = []; });
    cats.forEach(function(c) {
      var fam = c.family;
      if (fam && byFamily.hasOwnProperty(fam)) byFamily[fam].push(c);
      else orphans.push(c);
    });

    var esc = function(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); };

    var html = '';
    // Familles existantes (avec leurs sous-cats)
    families.forEach(function(f) {
      var subs = byFamily[f];
      html += '<div class="fam-block">'
           + '  <div class="fam-header">'
           + '    <span class="fam-name">📁 ' + f + '</span>'
           + '    <span class="fam-count">' + subs.length + ' catégorie' + (subs.length > 1 ? 's' : '') + '</span>'
           + '    <div class="fam-actions">'
           + '      <button class="btn btn-ghost btn-sm" title="Renommer" onclick="Admin.promptRenameFamily(\'' + esc(f) + '\')">✎</button>'
           + '      <button class="btn btn-danger btn-sm" title="Supprimer" onclick="Admin.promptDeleteFamily(\'' + esc(f) + '\')">🗑</button>'
           + '    </div>'
           + '  </div>'
           + '  <div class="fam-cats">';
      if (!subs.length) {
        html += '<div class="fam-empty">Aucune catégorie — glisse-en une depuis le bas, ou utilise le sélecteur</div>';
      } else {
        subs.forEach(function(c) { html += _renderCatChip(c, families); });
      }
      html += '  </div></div>';
    });

    // Orphelins (sans famille)
    if (orphans.length) {
      html += '<div class="fam-block fam-orphan">'
           + '  <div class="fam-header"><span class="fam-name">⚠ Sans famille</span>'
           + '  <span class="fam-count">' + orphans.length + ' à classer</span></div>'
           + '  <div class="fam-cats">';
      orphans.forEach(function(c) { html += _renderCatChip(c, families); });
      html += '  </div></div>';
    }

    list.innerHTML = html;

    function _renderCatChip(c, fams) {
      var safe = esc(c.name);
      var options = '<option value="">— Aucune —</option>' + fams.map(function(f) {
        return '<option value="' + f.replace(/"/g, '&quot;') + '"' + (c.family === f ? ' selected' : '') + '>' + f + '</option>';
      }).join('');
      return '<div class="cat-row" data-name="' + c.name.replace(/"/g, '&quot;') + '">'
           + '  <div class="cat-row-info">'
           + '    <span class="cat-row-name">' + c.name + '</span>'
           + '    <span class="cat-row-count">' + c.count + ' produit' + (c.count > 1 ? 's' : '') + '</span>'
           + '  </div>'
           + '  <select class="form-input cat-row-family" onchange="Admin.changeCatFamily(\'' + safe + '\', this.value)">' + options + '</select>'
           + '  <div class="cat-row-actions">'
           + '    <button class="btn btn-ghost btn-sm" title="Renommer" onclick="Admin.promptRenameCategory(\'' + safe + '\')">✎</button>'
           + '    <button class="btn btn-danger btn-sm" title="Supprimer" onclick="Admin.promptDeleteCategory(\'' + safe + '\')">🗑</button>'
           + '  </div>'
           + '</div>';
    }
  },

  async changeCatFamily(category, family) {
    var r = await API.assignCategoryToFamily(category, family || null);
    if (r && r.success) {
      Toast.success('"' + category + '" → ' + (family || 'Sans famille'));
      await this.refreshCategoriesList();
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
      if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  async promptRenameFamily(name) {
    var nv = (prompt('Renommer la famille "' + name + '" en :', name) || '').trim();
    if (!nv || nv === name) return;
    var r = await API.renameFamily(name, nv);
    if (r && r.success) { Toast.success('Famille renommée'); await this.refreshCategoriesList(); if (typeof Produits!=='undefined'&&Produits.render) Produits.render(); if (typeof Caisse!=='undefined'&&Caisse.render) Caisse.render(); }
    else Toast.error((r && r.error) || 'Erreur');
  },

  async promptDeleteFamily(name) {
    if (!confirm('Supprimer la famille "' + name + '" ?\n\nLes catégories à l\'intérieur seront simplement "désassignées" (ne supprime PAS les produits).')) return;
    var r = await API.deleteFamily(name);
    if (r && r.success) { Toast.success('Famille supprimée'); await this.refreshCategoriesList(); if (typeof Produits!=='undefined'&&Produits.render) Produits.render(); if (typeof Caisse!=='undefined'&&Caisse.render) Caisse.render(); }
    else Toast.error((r && r.error) || 'Erreur');
  },

  async promptCreateFamily() {
    var n = (prompt('Nom de la nouvelle famille (ex: Boisson Chaude, Cake) :') || '').trim();
    if (!n) return;
    var r = await API.createFamily(n);
    if (r && r.success) { Toast.success('Famille "' + n + '" créée'); await this.refreshCategoriesList(); }
    else Toast.error((r && r.error) || 'Erreur');
  },

  filterCategoriesList(q) {
    if (!this._catsCache) return;
    var qq = (q || '').toLowerCase().trim();
    var filtered = qq
      ? this._catsCache.filter(function(c) { return c.name.toLowerCase().indexOf(qq) >= 0; })
      : this._catsCache;
    this._renderCategoriesList(filtered);
  },

  async promptRenameCategory(name) {
    var newName = (prompt('Renommer "' + name + '" en :', name) || '').trim();
    if (!newName || newName === name) return;
    var r = await API.renameCategory(name, newName);
    if (r && r.success) {
      Toast.success(r.updated + ' produit(s) déplacé(s) vers "' + newName + '"');
      Store.clearCache();
      await Store.loadProduits({ useCache: false });
      await this.refreshCategoriesList();
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
      if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  async promptDeleteCategory(name) {
    var cats = (this._catsCache || []).filter(function(c) { return c.name !== name; });
    var moveOptions = ['Divers'].concat(cats.map(function(c) { return c.name; }).filter(function(n) { return n !== 'Divers'; }));
    // Choix : déplacer ou supprimer définitivement
    var choice = prompt(
      'Supprimer la catégorie "' + name + '" ?\n\n' +
      '⚠ Les produits seront DÉPLACÉS vers une autre catégorie.\n\n' +
      'Tape le NOM d\'une catégorie cible (ou "Divers" par défaut)\n' +
      'OU tape "SUPPRIMER" pour supprimer DÉFINITIVEMENT les produits.\n\n' +
      'Catégories disponibles : ' + moveOptions.slice(0, 8).join(', ') + (moveOptions.length > 8 ? '…' : ''),
      'Divers'
    );
    if (choice === null) return;
    var v = choice.trim();
    var r;
    if (v.toUpperCase() === 'SUPPRIMER') {
      if (!confirm('CONFIRMER la suppression DÉFINITIVE de tous les produits de "' + name + '" ?\n\nIRRÉVERSIBLE.')) return;
      r = await API.deleteCategory(name, { purge: true });
    } else {
      r = await API.deleteCategory(name, { moveTo: v || 'Divers' });
    }
    if (r && r.success) {
      if (r.mode === 'purged') Toast.success(r.count + ' produit(s) supprimé(s)');
      else                     Toast.success(r.count + ' produit(s) déplacé(s) vers "' + r.moveTo + '"');
      Store.clearCache();
      await Store.loadProduits({ useCache: false });
      await this.refreshCategoriesList();
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
      if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  // ── Nouvelle catégorie avec produits en lot ──────────
  openAddCategory() {
    if (!Auth.can('products.edit')) { Toast.warn('Permission refusée'); return; }
    document.getElementById('nc-nom').value = '';
    document.getElementById('nc-products-list').innerHTML = '';
    // 3 lignes vides par défaut
    this.addCategoryRow(); this.addCategoryRow(); this.addCategoryRow();
    Modal.open('modal-category');
  },

  addCategoryRow() {
    var list = document.getElementById('nc-products-list');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'nc-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 100px 28px;gap:8px;align-items:center';
    row.innerHTML =
      '<input class="form-input nc-prod-nom"  placeholder="Nom du produit"     maxlength="80">' +
      '<input class="form-input nc-prod-prix" placeholder="Prix DT" type="number" step="0.5" min="0">' +
      '<button type="button" class="btn btn-ghost btn-sm" title="Retirer" onclick="this.parentNode.remove()" style="padding:6px 8px">✕</button>';
    list.appendChild(row);
    row.querySelector('.nc-prod-nom').focus();
  },

  async saveCategory() {
    var nom = (document.getElementById('nc-nom').value || '').trim();
    if (!nom) { Toast.warn('Nom de catégorie requis'); return; }
    var rows = Array.from(document.querySelectorAll('#nc-products-list .nc-row'));
    var products = [];
    rows.forEach(function(r) {
      var n = (r.querySelector('.nc-prod-nom').value || '').trim();
      var p = parseFloat(r.querySelector('.nc-prod-prix').value);
      if (n && !isNaN(p) && p > 0) products.push({ nom: n, prix: p });
    });
    if (!products.length) { Toast.warn('Ajoute au moins un produit valide (nom + prix)'); return; }

    var btn = document.querySelector('#modal-category .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Création…'; }

    var ok = 0, fail = 0;
    for (var i = 0; i < products.length; i++) {
      var pp = products[i];
      var res = await API.createProduit({
        nom: pp.nom, prix: pp.prix, categorie: nom,
        actif: true, stock_initial: 0,
      });
      if (res && res.success) ok++;
      else fail++;
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Créer la catégorie + produits'; }
    Modal.close('modal-category');

    if (fail) Toast.warn(ok + ' créés, ' + fail + ' échecs');
    else      Toast.success('Catégorie "' + nom + '" créée avec ' + ok + ' produit(s)');

    Store.clearCache();
    await Store.loadProduits({ useCache: false });
    if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
    if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
  },

  async saveProduct() {
    const btn = document.querySelector('#modal-product .btn-primary');
    const origText = btn ? btn.textContent : 'Enregistrer';
    const nom  = document.getElementById('np-nom').value.trim();
    const prix = parseFloat(document.getElementById('np-prix').value);
    const catSel = document.getElementById('np-cat');
    const cat  = catSel && catSel.value !== '__new__' ? catSel.value : 'Divers';
    const stockInit = parseInt(document.getElementById('np-stock')?.value) || 0;
    const cout  = parseFloat(document.getElementById('np-cout')?.value);
    const seuil = parseInt(document.getElementById('np-seuil')?.value);
    const actifEl = document.getElementById('np-actif');
    const actif = actifEl ? actifEl.checked : true;
    const editingId = this._editingProductId;

    if (!nom || isNaN(prix) || prix <= 0) { Toast.warn('Nom et prix requis'); return; }
    if (btn) { btn.disabled = true; btn.textContent = editingId ? 'Mise à jour…' : 'Création…'; }

    const imgEl = document.getElementById('np-image');
    const image_url = imgEl ? (imgEl.value || '').trim() : '';

    let res;
    if (editingId) {
      // ── PATCH : modification d'un produit existant ──
      const patch = { nom, prix, categorie: cat, actif };
      if (image_url) patch.image_url = image_url;
      // Stock : on ne PATCH le stock QUE si la valeur > 0 (sinon on ne touche pas au tracking existant)
      if (!isNaN(stockInit) && stockInit > 0) patch.stock_actuel = stockInit;
      if (!isNaN(cout)  && cout  > 0) patch.cout_unitaire = cout;
      if (!isNaN(seuil) && seuil > 0) patch.seuil_minimum = seuil;
      res = await API.updateProduit(editingId, patch);
    } else {
      // ── POST : création ──
      const payload = {
        nom, prix, categorie: cat, actif,
        stock_initial: stockInit,
        seuil_minimum: isNaN(seuil) ? 5 : seuil,
        cout_unitaire: isNaN(cout) ? null : cout,
      };
      if (image_url) payload.image_url = image_url;
      res = await API.createProduit(payload);
    }
    if (btn) { btn.disabled = false; btn.textContent = origText; }

    if (!res || !res.success) {
      Toast.error((res && res.error) || 'Erreur');
      return;
    }

    // ── EDIT : mise à jour Store + re-render ──
    if (editingId) {
      var p = Store.getProduit(editingId);
      if (p) {
        p.nom = nom; p.prix = prix; p.cat = cat; p.categorie = cat; p.actif = actif;
        if (image_url) p.image_url = image_url;
      }
      Store.clearCache();
      Modal.close('modal-product');
      this._editingProductId = null;
      Toast.success('"' + nom + '" modifié');
      // Re-render des pages
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
      if (typeof Caisse   !== 'undefined' && Caisse.render)   Caisse.render();
      Store.loadProduits({ useCache: false });
      return;
    }

    // ── Insertion optimiste dans Store, sans re-fetch ─────────
    const newProd = res.produit ? Store._map(res.produit) : {
      id: Date.now(), nom, prix, cat: cat, actif: true,
      tracked: stockInit > 0,
      stock: stockInit > 0 ? stockInit : null,
      seuil: stockInit > 0 ? (isNaN(seuil) ? 5 : seuil) : null,
      cout: isNaN(cout) ? 0 : cout,
    };
    Store.produits.push(newProd);
    Store.clearCache();

    Modal.close('modal-product');
    Toast.success(`"${nom}" ajouté` + (stockInit > 0 ? ` (stock: ${stockInit})` : ''));

    // ── Mises à jour ciblées (uniquement la page active) ─────
    const activePage = document.querySelector('.page.active');
    const pageId = activePage ? activePage.id : '';

    if (pageId === 'page-produits' && typeof Produits !== 'undefined' && Produits.appendNewProduct) {
      Produits.appendNewProduct(newProd);
    } else if (pageId === 'page-caisse' && typeof Caisse !== 'undefined' && Caisse.render) {
      Caisse.render();
    } else if (pageId === 'page-stock' && typeof Stock !== 'undefined' && Stock.render) {
      Stock.render();
    }

    // Rafraîchir Store en arrière-plan pour récupérer l'ID définitif Supabase
    Store.loadProduits({ useCache: false });
  },
};
