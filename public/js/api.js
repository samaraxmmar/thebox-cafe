/* ══════════════════════════════════════════════════════
   THE BOX — API Layer
══════════════════════════════════════════════════════ */
const API = {
  BASE: '/api',
  TIMEOUT_MS: 20000, // 20s par requête, override possible via options.timeout

  async _fetch(path, options = {}) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutMs = options.timeout || this.TIMEOUT_MS;
    var to = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, timeoutMs) : null;
    try {
      var fetchOpts = {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        ...options,
      };
      if (ctrl) fetchOpts.signal = ctrl.signal;

      const res = await fetch(this.BASE + path, fetchOpts);
      if (res.status === 401) {
        if (window.Auth && typeof Auth.logout === 'function') Auth.logout();
        return { error: 'Non authentifié' };
      }
      if (res.status === 429) {
        return { error: 'Trop de requêtes — réessaie dans un instant' };
      }
      if (res.status === 504) {
        return { error: 'Délai serveur dépassé' };
      }
      if (!res.ok) {
        const txt = await res.text();
        console.error('[API]', path, res.status, txt);
        try { return { error: JSON.parse(txt).error || ('HTTP ' + res.status) }; }
        catch (_) { return { error: 'HTTP ' + res.status }; }
      }
      return await res.json();
    } catch (e) {
      if (e && e.name === 'AbortError') {
        console.warn('[API] timeout', path);
        return { error: 'Délai d\'attente dépassé (20s)' };
      }
      console.error('[API] fetch failed', path, e);
      return { error: (e && e.message) || 'Erreur réseau' };
    } finally {
      if (to) clearTimeout(to);
    }
  },

  // ── Auth ────────────────────────────────────────────
  me()                     { return this._fetch('/auth/me'); },
  changePin(current, next) { return this._fetch('/auth/change-pin', { method:'POST', body: JSON.stringify({ current, next }) }); },

  // ── Users (admin) ───────────────────────────────────
  getUsers()               { return this._fetch('/users'); },
  createUser(u)            { return this._fetch('/users', { method:'POST', body: JSON.stringify(u) }); },
  updateUser(id, patch)    { return this._fetch('/users/' + id, { method:'PATCH', body: JSON.stringify(patch) }); },
  deleteUser(id)           { return this._fetch('/users/' + id, { method:'DELETE' }); },

  // ── Permissions ─────────────────────────────────────
  getPermissions()         { return this._fetch('/permissions'); },
  updatePermissions(patch) { return this._fetch('/permissions', { method:'PATCH', body: JSON.stringify(patch) }); },
  resetPermissions()       { return this._fetch('/permissions/reset', { method:'POST' }); },

  // ── Settings ────────────────────────────────────────
  getSettings()            { return this._fetch('/settings'); },
  saveSettings(patch)      { return this._fetch('/settings', { method:'PATCH', body: JSON.stringify(patch) }); },
  backupUrl()              { return this.BASE + '/settings/backup'; },
  restore(data)            { return this._fetch('/settings/restore', { method:'POST', body: JSON.stringify({ data }) }); },

  // ── Logs ────────────────────────────────────────────
  getLogs(limit = 200, level) { return this._fetch('/logs?limit=' + limit + (level ? '&level=' + level : '')); },
  clearLogs()                 { return this._fetch('/logs', { method:'DELETE' }); },

  // ── Reports ─────────────────────────────────────────
  zJour(date)                 { return this._fetch('/reports/z-jour' + (date ? '?date=' + date : '')); },
  zMois(year, month)          { return this._fetch('/reports/z-mois?year=' + year + '&month=' + month); },
  etats(from, to)             { return this._fetch('/reports/etats?from=' + from + '&to=' + to); },
  valorisation()              { return this._fetch('/reports/valorisation'); },
  exportUrl(kind, from, to)   { return this.BASE + '/reports/export?kind=' + kind + (from ? '&from=' + from : '') + (to ? '&to=' + to : ''); },

  // ── Movements ───────────────────────────────────────
  getMovements(limit = 200)   { return this._fetch('/movements?limit=' + limit); },
  createMovement(m)           { return this._fetch('/movements', { method:'POST', body: JSON.stringify(m) }); },

  // ── Status ──────────────────────────────────────────
  status()                 { return this._fetch('/status'); },
  testWA(message)          { return this._fetch('/status/test-wa', { method:'POST', body: JSON.stringify({ message }) }); },

  // ── Produits ────────────────────────────────────────
  getProduits()            { return this._fetch('/produits'); },
  createProduit(data)      { return this._fetch('/produits', { method:'POST', body: JSON.stringify(data) }); },
  updateProduit(id, patch) { return this._fetch('/produits/' + id, { method:'PATCH', body: JSON.stringify(patch) }); },
  toggleProduit(id, actif) { return this._fetch('/produits/' + id + '/toggle', { method:'PATCH', body: JSON.stringify({ actif }) }); },
  deleteProduit(id)        { return this._fetch('/produits/' + id, { method:'DELETE' }); },

  // ── Catégories ──────────────────────────────────────
  getCategories()            { return this._fetch('/produits/categories'); },
  renameCategory(from, to)   { return this._fetch('/produits/categories/rename', { method:'POST', body: JSON.stringify({ from, to }) }); },
  deleteCategory(name, opts) { return this._fetch('/produits/categories/delete', { method:'POST', body: JSON.stringify(Object.assign({ name }, opts || {})) }); },
  assignCategoryToFamily(category, family) { return this._fetch('/produits/categories/assign', { method:'POST', body: JSON.stringify({ category, family }) }); },

  // ── Familles (groupes de catégories) ────────────────
  getFamilies()              { return this._fetch('/produits/families'); },
  createFamily(name)         { return this._fetch('/produits/families', { method:'POST', body: JSON.stringify({ name }) }); },
  renameFamily(from, to)     { return this._fetch('/produits/families/' + encodeURIComponent(from), { method:'PATCH', body: JSON.stringify({ to }) }); },
  deleteFamily(name)         { return this._fetch('/produits/families/' + encodeURIComponent(name), { method:'DELETE' }); },

  // ── Stock ───────────────────────────────────────────
  getStock()               { return this._fetch('/stock'); },
  createIngredient(data)   { return this._fetch('/stock', { method:'POST', body: JSON.stringify(data) }); },
  reappro(id, quantite)    { return this._fetch('/stock/' + id, { method:'PATCH', body: JSON.stringify({ quantite }) }); },
  deleteIngredient(id)     { return this._fetch('/stock/' + id, { method:'DELETE' }); },

  // ── Orders / Commandes ──────────────────────────────
  createOrder(data)        { return this._fetch('/orders', { method:'POST', body: JSON.stringify(data) }); },
  getCommandes()           { return this._fetch('/commandes'); },
  cancelCommande(id)       { return this._fetch('/commandes/' + id + '/cancel', { method:'PATCH' }); },
  deleteCommande(id)       { return this._fetch('/commandes/' + id, { method:'DELETE' }); },
  previewDeleteByDate(date){ return this._fetch('/commandes/by-date/preview?date=' + encodeURIComponent(date)); },
  deleteByDate(date)       { return this._fetch('/commandes/by-date?date=' + encodeURIComponent(date), { method:'DELETE' }); },

  // ── Tables ──────────────────────────────────────────
  getTables()              { return this._fetch('/tables'); },
  openTable(id, couverts)  { return this._fetch('/tables/' + id + '/open', { method:'POST', body: JSON.stringify({ nb_couverts: couverts }) }); },
  closeTable(id)           { return this._fetch('/tables/' + id + '/close', { method:'POST' }); },
  reserveTable(id, data)   { return this._fetch('/tables/' + id + '/reserve', { method:'POST', body: JSON.stringify(data) }); },
  cancelReservation(id)    { return this._fetch('/tables/' + id + '/reserve', { method:'DELETE' }); },
  transferTable(from, to)  { return this._fetch('/tables/transfer', { method:'POST', body: JSON.stringify({ from_table_id: from, to_table_id: to }) }); },
  createTable(data)        { return this._fetch('/tables', { method:'POST', body: JSON.stringify(data) }); },
  updateTable(id, patch)   { return this._fetch('/tables/' + id, { method:'PATCH', body: JSON.stringify(patch) }); },
  deleteTable(id)          { return this._fetch('/tables/' + id, { method:'DELETE' }); },
  saveTableLayout(tables)  { return this._fetch('/tables/layout/save', { method:'PATCH', body: JSON.stringify({ tables }) }); },

  // ── Stats (legacy) ──────────────────────────────────
  getStats(date)           { return this._fetch('/stats' + (date ? '?date=' + encodeURIComponent(date) : '')); },
  getEvolution(days = 7, date)    { return this._fetch('/stats/evolution?days=' + days + (date ? '&date=' + encodeURIComponent(date) : '')); },
  getEvolutionCats(days = 7, date){ return this._fetch('/stats/evolution-cats?days=' + days + (date ? '&date=' + encodeURIComponent(date) : '')); },
  getStatsCmds(date)       { return this._fetch('/stats/commandes' + (date ? '?date=' + encodeURIComponent(date) : '')); },
};
