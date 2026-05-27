'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Stock overlay
   Stockage local du stock par produit (data/stock.json).
   Sert de fallback / source de vérité quand les colonnes Supabase
   stock_actuel / seuil_minimum / cout_unitaire n'existent pas en BD.

   Structure : { "<produit_id>": { stock, seuil, cout, updated_at } }
   ────────────────────────────────────────────────────────────────────── */

const storage = require('./storage');

const FILE = 'stock';

function _all() { return storage.read(FILE, {}) || {}; }
function _save(obj) { storage.write(FILE, obj); }

/** Renvoie {stock, seuil, cout} ou null si non suivi. */
function get(produitId) {
  const all = _all();
  const e = all[produitId];
  return e ? { stock: e.stock || 0, seuil: e.seuil || 0, cout: e.cout || 0 } : null;
}

/** Définit ou remplace l'entrée pour un produit. */
function set(produitId, { stock, seuil, cout } = {}) {
  if (!produitId) return;
  const all = _all();
  all[produitId] = {
    stock: stock != null ? parseFloat(stock) : 0,
    seuil: seuil != null ? parseFloat(seuil) : 0,
    cout:  cout  != null ? parseFloat(cout)  : 0,
    updated_at: new Date().toISOString(),
  };
  _save(all);
  return all[produitId];
}

/** Incrémente le stock (positif=ajout, négatif=retrait). Crée l'entrée si absente. */
function adjust(produitId, delta, allowNegative = true) {
  if (!produitId) return null;
  const all = _all();
  const cur = all[produitId] || { stock: 0, seuil: 0, cout: 0 };
  const newStock = allowNegative
    ? cur.stock + parseFloat(delta)
    : Math.max(0, cur.stock + parseFloat(delta));
  all[produitId] = {
    ...cur,
    stock: newStock,
    updated_at: new Date().toISOString(),
  };
  _save(all);
  return all[produitId];
}

/** Supprime l'entrée d'un produit (à appeler quand le produit est supprimé). */
function remove(produitId) {
  const all = _all();
  if (all[produitId]) {
    delete all[produitId];
    _save(all);
    return true;
  }
  return false;
}

/** Liste des IDs de produits suivis. */
function trackedIds() { return Object.keys(_all()).map(Number); }

/** Merge: ajoute stock_actuel/seuil_minimum/cout_unitaire sur les rows produits. */
function augmentProducts(products) {
  const all = _all();
  return (products || []).map(p => {
    const e = all[p.id];
    if (!e) {
      // Pas d'entrée locale : on garde ce qui est en DB (si présent), sinon null
      return p;
    }
    return {
      ...p,
      stock_actuel:  e.stock,
      seuil_minimum: e.seuil,
      cout_unitaire: e.cout,
      tracked:       true,
    };
  });
}

/** True si le produit a une entrée stock locale OU une valeur Supabase. */
function isTracked(produit) {
  if (!produit) return false;
  const all = _all();
  if (all[produit.id]) return true;
  return produit.stock_actuel != null;
}

module.exports = { get, set, adjust, remove, trackedIds, augmentProducts, isTracked };
