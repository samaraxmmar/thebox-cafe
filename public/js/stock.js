/* ══════════════════════════════════════════════════════
   THE BOX — Stock page (gère le stock DIRECTEMENT sur les produits)
══════════════════════════════════════════════════════ */

const Stock = {
  _loading: false,
  async render() {
    this._renderActions();
    // Si Store pas encore chargé → afficher loading + fetch + re-render
    if ((!Store._loaded || !Store._loaded.produits) && !this._loading) {
      this._loading = true;
      var cards = document.getElementById('stock-cards');
      if (cards) cards.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px;text-align:center"><div class="spinner" style="margin:0 auto 12px"></div>Chargement du stock…</div>';
      try { await Store.loadProduits({ useCache: false }); } catch (_) {}
      this._loading = false;
    }
    this._renderCards();
    this._renderTable();
  },

  _renderActions() {
    document.getElementById('stock-actions').innerHTML = Auth.can('stock.edit')
      ? '<button class="btn btn-primary btn-sm" onclick="Stock.openAddIngredient()">+ Ajouter produit</button>'
      : '';
  },

  _trackedList() {
    return (Store.produits || []).filter(p => p.tracked);
  },

  _renderCards() {
    const list = this._trackedList();
    const bas  = list.filter(p => p.stock < p.seuil);
    const ok   = list.filter(p => p.stock >= p.seuil);

    document.getElementById('stock-cards').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Produits suivis</div>
        <div class="stat-value">${list.length}</div>
        <div class="stat-delta">sur ${Store.produits.length} produits</div>
      </div>
      <div class="stat-card" style="border-color:${bas.length ? 'rgba(215,44,13,.35)' : 'var(--border)'}">
        <div class="stat-label">Stock bas</div>
        <div class="stat-value" style="color:${bas.length ? 'var(--red)' : 'var(--green)'}">${bas.length}</div>
        <div class="stat-delta">${bas.map(p => p.nom).join(', ') || 'Tout est OK'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Stock OK</div>
        <div class="stat-value" style="color:var(--green)">${ok.length}</div>
      </div>`;
  },

  _renderTable() {
    const canEdit = Auth.can('stock.edit');
    const list = this._trackedList();
    const rows = list.map(p => {
      const cls = p.stock < p.seuil ? 'badge-red' : p.stock < p.seuil * 1.5 ? 'badge-orange' : 'badge-green';
      const lbl = p.stock < p.seuil ? 'Bas'       : p.stock < p.seuil * 1.5 ? 'Attention'    : 'OK';

      const reapproBtn = canEdit
        ? `<button class="btn btn-ghost btn-sm" onclick="Stock.reappro(${p.id})">Réapprovisionner</button>`
        : '';
      const deleteBtn = canEdit
        ? `<button class="btn btn-danger btn-sm" onclick="Stock.delete(${p.id})">🗑</button>`
        : '';

      return `
        <tr>
          <td class="primary">${p.nom}</td>
          <td class="mono">${p.stock}</td>
          <td class="mono">${p.seuil}</td>
          <td>unité</td>
          <td><span class="badge ${cls}">${lbl}</span></td>
          <td class="actions">${reapproBtn}${deleteBtn}</td>
        </tr>`;
    });

    document.getElementById('stock-table').innerHTML = rows.join('')
      || '<tr><td colspan="6" class="empty-td">Aucun produit suivi. Pour suivre un produit, crée-le avec un stock initial &gt; 0 dans la page Produits.</td></tr>';
  },

  async reappro(id) {
    const p = Store.getProduit(id);
    if (!p) return;
    const qty = parseFloat(prompt(`Ajouter au stock :\n${p.nom}`));
    if (isNaN(qty) || qty <= 0) return;

    const res = await API.reappro(id, qty);
    if (res && res.success) {
      Store.clearCache();
      await Store.loadProduits({ useCache:false });
      Toast.success(`${p.nom} : +${qty} unité ajoutée`);
      this.render();
      if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
    } else {
      Toast.error((res && res.error) || 'Erreur réappro');
    }
  },

  async delete(id) {
    const p = Store.getProduit(id);
    if (!p) return;
    if (!confirm(`Supprimer DÉFINITIVEMENT "${p.nom}" ?\n\nLes lignes de commande associées seront également supprimées.\nCette action est irréversible.`)) return;

    const res = await API.deleteIngredient(id);
    if (res && res.success) {
      Store.clearCache();
      await Store.loadProduits({ useCache:false });
      Toast.success(`"${p.nom}" supprimé`);
      this.render();
      if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
      if (typeof Produits !== 'undefined' && Produits.render) Produits.render();
    } else {
      Toast.error((res && res.error) || 'Erreur suppression');
    }
  },

  // "Ajouter produit" depuis la page Stock → redirige vers le formulaire
  // produit complet (avec prix, catégorie, etc.) au lieu d'une modal allégée.
  openAddIngredient() {
    if (!Auth.can('stock.edit')) { Toast.warn('Permission refusée'); return; }
    if (typeof Admin !== 'undefined' && Admin.openAddProduct) {
      Admin.openAddProduct();
    } else {
      Toast.warn('Va sur Produits → + Nouveau produit');
    }
  },

  // Plus utilisé — gardé pour compat éventuelle
  async saveIngredient() {
    Modal.close && Modal.close('modal-ingredient');
  },
};
