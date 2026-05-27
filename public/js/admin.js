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
    document.getElementById('np-nom').value   = '';
    document.getElementById('np-prix').value  = '';
    const stockEl = document.getElementById('np-stock'); if (stockEl) stockEl.value = '0';
    const coutEl  = document.getElementById('np-cout');  if (coutEl)  coutEl.value  = '';
    const seuilEl = document.getElementById('np-seuil'); if (seuilEl) seuilEl.value = '5';
    Modal.open('modal-product');
  },
  // Alias utilisé depuis la page Produits
  openProductModal() { return this.openAddProduct(); },

  async saveProduct() {
    const btn = document.querySelector('#modal-product .btn-primary');
    const nom  = document.getElementById('np-nom').value.trim();
    const prix = parseFloat(document.getElementById('np-prix').value);
    const cat  = document.getElementById('np-cat').value;
    const stockInit = parseInt(document.getElementById('np-stock')?.value) || 0;
    const cout  = parseFloat(document.getElementById('np-cout')?.value);
    const seuil = parseInt(document.getElementById('np-seuil')?.value);

    if (!nom || isNaN(prix) || prix <= 0) { Toast.warn('Nom et prix requis'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Création...'; }

    const payload = {
      nom, prix, categorie: cat,
      stock_initial: stockInit,
      seuil_minimum: isNaN(seuil) ? 5 : seuil,
      cout_unitaire: isNaN(cout) ? null : cout,
    };

    const res = await API.createProduit(payload);
    if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }

    if (!res || !res.success) {
      Toast.error((res && res.error) || 'Erreur');
      return; // modal reste ouverte pour correction
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
