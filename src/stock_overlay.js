'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Stock overlay
   Stockage local par produit dans data/stock.json :
   { "<produit_id>": { tracked, stock, seuil, cout, image, updated_at } }

   - tracked: true  → produit SUIVI (stock décrémenté, alertes rupture)
   - tracked: false → produit non suivi (entrée juste pour stocker l'image)
   ────────────────────────────────────────────────────────────────────── */

const storage = require('./storage');
const FILE = 'stock';

function _all() { return storage.read(FILE, {}) || {}; }
function _save(obj) { storage.write(FILE, obj); }

/** Renvoie {tracked, stock, seuil, cout, image} ou null si entrée absente. */
function get(produitId) {
  const all = _all();
  const e = all[produitId];
  if (!e) return null;
  return {
    tracked: e.tracked === true,
    stock:   e.stock || 0,
    seuil:   e.seuil || 0,
    cout:    e.cout  || 0,
    image:   e.image || null,
  };
}

/** Définit ou met à jour. Préserve les champs absents. */
function set(produitId, { tracked, stock, seuil, cout, image } = {}) {
  if (!produitId) return;
  const all = _all();
  const prev = all[produitId] || {};
  all[produitId] = {
    tracked: tracked !== undefined ? !!tracked : (prev.tracked === true),
    stock:   stock != null ? parseFloat(stock) : (prev.stock || 0),
    seuil:   seuil != null ? parseFloat(seuil) : (prev.seuil || 0),
    cout:    cout  != null ? parseFloat(cout)  : (prev.cout  || 0),
    image:   image !== undefined ? image : (prev.image || null),
    updated_at: new Date().toISOString(),
  };
  _save(all);
  return all[produitId];
}

/** Met juste l'image (n'active pas le tracking, ne touche pas au stock). */
function setImage(produitId, imageUrl) {
  if (!produitId) return;
  const all = _all();
  const prev = all[produitId] || { tracked: false, stock: 0, seuil: 0, cout: 0 };
  all[produitId] = {
    ...prev,
    image: imageUrl || null,
    updated_at: new Date().toISOString(),
  };
  _save(all);
  return all[produitId];
}

/** Active le tracking de stock (entrée tracked:true). */
function enableTracking(produitId, { stock = 0, seuil = 5, cout = 0 } = {}) {
  return set(produitId, { tracked: true, stock, seuil, cout });
}

/** Désactive le tracking (mais GARDE l'image éventuelle). */
function disableTracking(produitId) {
  const all = _all();
  const prev = all[produitId];
  if (!prev) return;
  all[produitId] = { ...prev, tracked: false, stock: 0, seuil: 0, updated_at: new Date().toISOString() };
  _save(all);
  return all[produitId];
}

/** Incrémente le stock (positif=ajout, négatif=retrait). N'agit QUE si tracked. */
function adjust(produitId, delta, allowNegative = true) {
  if (!produitId) return null;
  const all = _all();
  const cur = all[produitId];
  if (!cur || cur.tracked !== true) return null;       // non suivi → on touche rien
  const newStock = allowNegative
    ? cur.stock + parseFloat(delta)
    : Math.max(0, cur.stock + parseFloat(delta));
  all[produitId] = { ...cur, stock: newStock, updated_at: new Date().toISOString() };
  _save(all);
  return all[produitId];
}

function remove(produitId) {
  const all = _all();
  if (all[produitId]) { delete all[produitId]; _save(all); return true; }
  return false;
}

/** Liste des IDs SUIVIS (tracked:true) — pour la page Stock. */
function trackedIds() {
  const all = _all();
  return Object.keys(all).filter(id => all[id].tracked === true).map(Number);
}

/** Merge : ajoute stock_actuel / seuil_minimum / cout_unitaire / image_url
    selon ce qu'il y a dans l'overlay. Ne marque tracked QUE si entrée tracked:true. */
function augmentProducts(products) {
  const all = _all();
  return (products || []).map(p => {
    const e = all[p.id];
    const out = { ...p };
    if (e) {
      if (e.tracked === true) {
        out.stock_actuel  = e.stock;
        out.seuil_minimum = e.seuil;
        out.tracked       = true;
      }
      if (e.cout != null && e.cout > 0) out.cout_unitaire = e.cout;
      if (e.image) out.image_url = e.image;
    }
    return out;
  });
}

function isTracked(produit) {
  if (!produit) return false;
  const all = _all();
  const e = all[produit.id];
  return e && e.tracked === true;
}

/* Migration douce : entrées existantes sans flag `tracked` doivent être
   normalisées. Règle : une entrée est tracked SEULEMENT si elle avait
   explicitement un stock > 0 dans la version précédente. Sinon on la met à false. */
(function _migrateLegacy() {
  try {
    const all = _all();
    let changed = false;
    for (const id of Object.keys(all)) {
      const e = all[id];
      if (typeof e.tracked !== 'boolean') {
        e.tracked = (parseFloat(e.stock) || 0) > 0;
        if (!e.tracked) { e.stock = 0; e.seuil = 0; }
        changed = true;
      }
    }
    if (changed) {
      _save(all);
      console.log('[stock_overlay] migration : flag tracked ajouté aux entrées existantes');
    }
  } catch (_) {}
})();

module.exports = {
  get, set, setImage, enableTracking, disableTracking,
  adjust, remove, trackedIds, augmentProducts, isTracked,
};
