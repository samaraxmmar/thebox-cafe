'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../auth');
const storage = require('../storage');

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Tables
   Tables persistées : data/tables.json + data/tables_sessions.json
   → survivent à un restart serveur.
   ────────────────────────────────────────────────────────────────────── */

const DEFAULT_TABLES = [
  { id: 1, numero: 1, nom: 'Table 1',    capacite: 4, statut: 'libre' },
  { id: 2, numero: 2, nom: 'Table 2',    capacite: 4, statut: 'libre' },
  { id: 3, numero: 3, nom: 'Table 3',    capacite: 4, statut: 'libre' },
  { id: 4, numero: 4, nom: 'Table 4',    capacite: 6, statut: 'libre' },
  { id: 5, numero: 5, nom: 'Table 5',    capacite: 4, statut: 'libre' },
  { id: 6, numero: 6, nom: 'Table 6',    capacite: 4, statut: 'libre' },
  { id: 7, numero: 7, nom: 'Terrasse 1', capacite: 4, statut: 'libre' },
  { id: 8, numero: 8, nom: 'Terrasse 2', capacite: 4, statut: 'libre' },
];

function _loadTables() {
  let t = storage.read('tables', null);
  if (!Array.isArray(t) || t.length === 0) {
    storage.write('tables', DEFAULT_TABLES);
    t = DEFAULT_TABLES.slice();
  }
  return t;
}
function _saveTables(t)     { storage.write('tables', t); }
function _loadSessions()    { return storage.read('tables_sessions', {}) || {}; }
function _saveSessions(s)   { storage.write('tables_sessions', s); }

function _hydrate() {
  const tables   = _loadTables();
  const sessions = _loadSessions();
  // Reconcile : si une session existe pour une table sans statut occupé → corrige
  for (const t of tables) {
    t.statut = sessions[t.id] ? 'occupée' : 'libre';
  }
  return { tables, sessions };
}

function _getView() {
  const { tables, sessions } = _hydrate();
  return tables.map(t => ({
    ...t,
    sessions_table: sessions[t.id] ? [sessions[t.id]] : [],
  }));
}

router.use(auth.requireAuth);

// GET /api/tables
router.get('/', auth.requirePerm('tables.view'), (req, res) => {
  res.json(_getView());
});

// POST /api/tables/:id/open
router.post('/:id/open', auth.requirePerm('tables.manage'), (req, res) => {
  const id = parseInt(req.params.id);
  const nb = (req.body && req.body.nb_couverts) || 1;
  const tables = _loadTables();
  const t = tables.find(x => x.id === id);
  if (!t) return res.status(404).json({ error: 'Table introuvable' });
  const sessions = _loadSessions();
  if (sessions[id]) return res.status(400).json({ error: 'Déjà ouverte' });

  t.statut = 'occupée';
  sessions[id] = {
    id: id, table_id: id, nb_couverts: nb,
    total: 0, statut: 'ouverte',
    opened_by: req.user.username,
    ouverte_at: new Date().toISOString(),
  };
  _saveTables(tables);
  _saveSessions(sessions);
  res.json({ success: true, session: sessions[id] });
});

// POST /api/tables/:id/close — "Encaisser & libérer"
router.post('/:id/close', auth.requirePerm('tables.manage'), (req, res) => {
  const id = parseInt(req.params.id);
  const sessions = _loadSessions();
  const sess = sessions[id];
  if (!sess) return res.status(404).json({ error: 'Aucune session' });
  const tables = _loadTables();
  const t = tables.find(x => x.id === id);
  if (t) t.statut = 'libre';
  const total = parseFloat(sess.total || 0);
  delete sessions[id];
  _saveTables(tables);
  _saveSessions(sessions);
  res.json({ success: true, total });
});

// POST /api/tables/transfer
router.post('/transfer', auth.requirePerm('tables.manage'), (req, res) => {
  const from = parseInt(req.body && req.body.from_table_id);
  const to   = parseInt(req.body && req.body.to_table_id);
  if (!from || !to) return res.status(400).json({ error: 'IDs manquants' });
  const tables   = _loadTables();
  const sessions = _loadSessions();
  if (!sessions[from]) return res.status(400).json({ error: 'Table source vide' });
  if (sessions[to])    return res.status(400).json({ error: 'Table cible déjà occupée' });

  sessions[to] = { ...sessions[from], table_id: to, id: to };
  delete sessions[from];
  const ft = tables.find(x => x.id === from);
  const tt = tables.find(x => x.id === to);
  if (ft) ft.statut = 'libre';
  if (tt) tt.statut = 'occupée';
  _saveTables(tables);
  _saveSessions(sessions);
  res.json({ success: true });
});

/** Clôture une table SANS passer par la route (appelé depuis orders.js). */
function closeTableProgrammatic(tableId) {
  const id = parseInt(tableId);
  const sessions = _loadSessions();
  if (!id || !sessions[id]) return false;
  const tables = _loadTables();
  const t = tables.find(x => x.id === id);
  if (t) t.statut = 'libre';
  delete sessions[id];
  _saveTables(tables);
  _saveSessions(sessions);
  return true;
}

/** Met à jour le total cumulé d'une session (appelé depuis orders.js). */
function bumpSessionTotal(tableId, amount) {
  const id = parseInt(tableId);
  const sessions = _loadSessions();
  if (!id || !sessions[id]) return false;
  sessions[id].total = parseFloat(sessions[id].total || 0) + parseFloat(amount || 0);
  _saveSessions(sessions);
  return true;
}

module.exports = router;
module.exports.closeTableProgrammatic = closeTableProgrammatic;
module.exports.bumpSessionTotal       = bumpSessionTotal;
