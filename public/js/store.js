/* ══════════════════════════════════════════════════════
   THE BOX — Store (modèle simplifié)
   - 1 produit = 1 entité avec stock direct
   - Pas d'ingrédients, pas de recettes
══════════════════════════════════════════════════════ */

const Store = {
  // ⚠ Politique caisse : stock négatif AUTORISÉ — on ne bloque jamais.
  allowNegativeStock: true,

  produits:     [],
  // ingredients = ALIAS de produits (pour compat avec le dashboard et autres modules)
  // Maintenu en lecture seule : ne pas l'écrire directement.
  ingredients:  [],
  orderCounter: 1,

  _loaded:    { produits: false, ingredients: false },
  _lastError: { produits: null, ingredients: null },

  CAT_COLORS: {
    'Boisson chaude': '#c8a96e',
    'Boisson froide': '#5c9fe0',
    'Pâtisserie':     '#e0935c',
    'Snack':          '#4caf7d',
  },

  // ── Cache localStorage (30 min — refresh quasi-instantané) ──
  _CACHE_TTL_MS: 30 * 60 * 1000,
  _CACHE_KEY_PRODUCTS: 'thebox_cache_produits_v4',

  _cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > this._CACHE_TTL_MS) return null;
      return data;
    } catch (_) { return null; }
  },
  _cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
  },
  clearCache() {
    try {
      localStorage.removeItem(this._CACHE_KEY_PRODUCTS);
      // anciens caches versionnés
      localStorage.removeItem('thebox_cache_produits_v3');
      localStorage.removeItem('thebox_cache_produits_v2');
      localStorage.removeItem('thebox_cache_ingredients_v2');
    } catch (_) {}
  },

  // ── Mapper Supabase → Store ──────────────────────────
  _map(p) {
    const isTracked = p.tracked === true || p.stock_actuel != null;
    return {
      id:      p.id,
      nom:     p.nom,
      prix:    parseFloat(p.prix),
      cat:     p.categorie || 'Boisson chaude',
      actif:   p.actif !== false,
      tracked: isTracked,
      stock:   isTracked ? parseFloat(p.stock_actuel ?? 0) : null,
      seuil:   isTracked ? parseFloat(p.seuil_minimum ?? 5) : null,
      cout:    parseFloat(p.cout_unitaire ?? 0),
      image:   p.image_url || null,
    };
  },

  /** Mise à jour synchrone de l'alias ingredients = produits (lecture). */
  _syncIngredientsAlias() {
    this.ingredients = this.produits.map(p => ({
      id:    p.id,
      nom:   p.nom,
      stock: p.stock,
      unite: 'unité',
      seuil: p.seuil,
      cout:  p.cout,
    }));
    this._loaded.ingredients = this._loaded.produits;
  },

  hydrateFromCache() {
    const cp = this._cacheGet(this._CACHE_KEY_PRODUCTS);
    if (Array.isArray(cp) && cp.length) {
      this.produits = cp;
      this._loaded.produits = true;
      this._syncIngredientsAlias();
      return true;
    }
    return false;
  },

  async loadProduits({ useCache = true } = {}) {
    if (useCache && this.produits.length === 0) {
      const cached = this._cacheGet(this._CACHE_KEY_PRODUCTS);
      if (Array.isArray(cached) && cached.length) {
        this.produits = cached;
        this._loaded.produits = true;
        this._syncIngredientsAlias();
      }
    }
    const data = await API.getProduits();
    if (data && Array.isArray(data)) {
      this.produits = data.map(p => this._map(p));
      this._loaded.produits = true;
      this._lastError.produits = null;
      this._cacheSet(this._CACHE_KEY_PRODUCTS, this.produits);
      this._syncIngredientsAlias();
      return true;
    }
    const errMsg = (data && data.error) || 'API produits inaccessible';
    this._lastError.produits = errMsg;
    console.error('[Store] Produits NON chargés :', errMsg);
    if (window.Toast && this.produits.length === 0) Toast.error('Produits : ' + errMsg);
    return false;
  },

  // Conservé pour compat avec dashboard.js / stock.js qui appellent loadIngredients()
  async loadIngredients(opts) {
    const ok = await this.loadProduits(opts);
    return ok;
  },

  async reload(opts) { return this.loadProduits(opts); },

  // ── Helpers ─────────────────────────────────────────
  getProduit(id) { return this.produits.find(p => p.id === id); },
  getIngredient(id) { return this.produits.find(p => p.id === id); },  // alias

  portionsDispo(produit) {
    if (!produit.tracked) return Infinity; // produit non suivi = stock illimité
    return Math.floor(parseFloat(produit.stock || 0));
  },
  canMake(produit) {
    if (!produit.tracked) return true;
    if (this.allowNegativeStock) return true;
    return parseFloat(produit.stock || 0) > 0;
  },
  isRupture(produit) {
    if (!produit.tracked) return false; // non suivi → jamais en rupture
    return parseFloat(produit.stock || 0) <= 0;
  },

  categories() {
    return ['Tous', ...new Set(
      this.produits.filter(p => p.actif).map(p => p.cat)
    )];
  },
};
