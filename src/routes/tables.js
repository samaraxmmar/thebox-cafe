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
  // x/y en %, shape: 'round'|'square'|'rect', rotation degrés
  { id: 1, numero: 1, nom: 'T-01', capacite: 2, statut: 'libre', zone: 'Salle',    x: 10, y: 15, shape: 'round',  rotation: 0 },
  { id: 2, numero: 2, nom: 'T-02', capacite: 4, statut: 'libre', zone: 'Salle',    x: 32, y: 15, shape: 'square', rotation: 0 },
  { id: 3, numero: 3, nom: 'T-03', capacite: 4, statut: 'libre', zone: 'Salle',    x: 56, y: 15, shape: 'square', rotation: 0 },
  { id: 4, numero: 4, nom: 'T-04', capacite: 6, statut: 'libre', zone: 'Salle',    x: 78, y: 15, shape: 'rect',   rotation: 0 },
  { id: 5, numero: 5, nom: 'T-05', capacite: 4, statut: 'libre', zone: 'Comptoir', x: 18, y: 55, shape: 'square', rotation: 0 },
  { id: 6, numero: 6, nom: 'T-06', capacite: 4, statut: 'libre', zone: 'Comptoir', x: 50, y: 55, shape: 'square', rotation: 0 },
  { id: 7, numero: 7, nom: 'T-07', capacite: 4, statut: 'libre', zone: 'Terrasse', x: 22, y: 30, shape: 'round',  rotation: 0 },
  { id: 8, numero: 8, nom: 'T-08', capacite: 4, statut: 'libre', zone: 'Terrasse', x: 62, y: 30, shape: 'round',  rotation: 0 },
];

function _loadTables() {
  let t = storage.read('tables', null);
  if (!Array.isArray(t) || t.length === 0) {
    storage.write('tables', DEFAULT_TABLES);
    t = DEFAULT_TABLES.slice();
    return t;
  }
  // Migration : ajouter x/y/shape/rotation aux tables existantes sans positions
  let migrated = false;
  t.forEach((row, idx) => {
    if (row.x == null) {
      // Grille auto : 4 par ligne, espacement 22%
      row.x = 10 + (idx % 4) * 24;
      migrated = true;
    }
    if (row.y == null) {
      row.y = 15 + Math.floor(idx / 4) * 30;
      migrated = true;
    }
    if (!row.shape)    { row.shape = idx % 3 === 0 ? 'round' : (idx % 3 === 1 ? 'square' : 'rect'); migrated = true; }
    if (row.rotation == null) { row.rotation = 0; migrated = true; }
  });
  if (migrated) {
    storage.write('tables', t);
    console.log('[tables] migration positions x/y/shape appliquée');
  }
  return t;
}
function _saveTables(t)     { storage.write('tables', t); }
function _loadSessions()    { return storage.read('tables_sessions', {}) || {}; }
function _saveSessions(s)   { storage.write('tables_sessions', s); }

function _hydrate() {
  const tables   = _loadTables();
  const sessions = _loadSessions();
  const reservations = storage.read('reservations', {}) || {};
  // Reconcile : statut = occupée > reservee > libre
  for (const t of tables) {
    if (sessions[t.id])      t.statut = 'occupée';
    else if (reservations[t.id]) t.statut = 'reservee';
    else                     t.statut = 'libre';
  }
  return { tables, sessions, reservations };
}

function _getView() {
  const { tables, sessions, reservations } = _hydrate();
  return tables.map(t => ({
    ...t,
    sessions_table: sessions[t.id] ? [sessions[t.id]] : [],
    reservation: reservations[t.id] || null,
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

// ── RÉSERVATIONS ────────────────────────────────────
function _loadReservations()    { return storage.read('reservations', {}) || {}; }
function _saveReservations(r)   { storage.write('reservations', r); }

// POST /api/tables/:id/reserve — créer une réservation
router.post('/:id/reserve', auth.requirePerm('tables.manage'), (req, res) => {
  console.log('[RESERVE] POST id=' + req.params.id + ' body=', req.body);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });
  const body = req.body || {};
  const tables = _loadTables();
  // Comparaison tolérante (string ou number)
  const t = tables.find(x => parseInt(x.id) === id);
  if (!t) {
    console.warn('[RESERVE] Table id=' + id + ' introuvable parmi ' + tables.length + ' tables');
    return res.status(404).json({ error: 'Table ' + id + ' introuvable' });
  }
  const sessions = _loadSessions();
  if (sessions[id]) return res.status(400).json({ error: 'Table déjà occupée — impossible de réserver' });

  const client_name = String(body.client_name || '').trim().slice(0, 60);
  const phone       = String(body.phone || '').trim().slice(0, 20);
  const nb_couverts = parseInt(body.nb_couverts) || (t.capacite || 2);
  const date_time   = String(body.date_time || '').trim();     // ISO string
  const notes       = String(body.notes || '').trim().slice(0, 200);
  if (!client_name) return res.status(400).json({ error: 'Nom client requis' });
  if (!date_time)   return res.status(400).json({ error: 'Date et heure requises' });

  const reservations = _loadReservations();
  reservations[id] = {
    table_id: id, client_name, phone, nb_couverts, date_time, notes,
    created_at: new Date().toISOString(),
    created_by: req.user.username,
  };
  t.statut = 'reservee';
  _saveReservations(reservations);
  _saveTables(tables);
  res.json({ success: true, reservation: reservations[id] });
});

// DELETE /api/tables/:id/reserve — annuler la réservation
router.delete('/:id/reserve', auth.requirePerm('tables.manage'), (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });
  const reservations = _loadReservations();
  if (!reservations[id]) return res.status(404).json({ error: 'Aucune réservation pour cette table' });
  delete reservations[id];
  const tables = _loadTables();
  const t = tables.find(x => parseInt(x.id) === id);
  if (t) t.statut = 'libre';
  _saveReservations(reservations);
  _saveTables(tables);
  res.json({ success: true });
});

// GET /api/tables/reservations — liste de toutes les réservations
router.get('/reservations', auth.requirePerm('tables.view'), (req, res) => {
  res.json(_loadReservations());
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

function _clampPercent(v) { v = parseFloat(v); if (!isFinite(v)) return 50; return Math.max(0, Math.min(100, v)); }
function _validShape(s) { return ['round','square','rect'].includes(String(s)) ? s : 'square'; }
function _clampSize(v) { v = parseInt(v); if (!isFinite(v) || isNaN(v)) return null; return Math.max(2, Math.min(800, v)); }
function _validKind(k)  { return k === 'wall' ? 'wall' : 'table'; }

// POST /api/tables — créer une nouvelle table (admin)
router.post('/', auth.requirePerm('tables.admin'), (req, res) => {
  const tables = _loadTables();
  const body = req.body || {};
  const nom = String(body.nom || '').trim().slice(0, 40);
  const capacite = parseInt(body.capacite) || 4;
  const zone = String(body.zone || 'Salle').trim().slice(0, 30);
  if (!nom) return res.status(400).json({ error: 'Nom requis' });

  const id = (tables.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  const numero = (tables.reduce((m, x) => Math.max(m, x.numero || 0), 0) || 0) + 1;
  const kind = _validKind(body.kind);
  const t = {
    id, numero, nom, capacite, statut: 'libre', zone, kind,
    x: body.x != null ? _clampPercent(body.x) : 50,
    y: body.y != null ? _clampPercent(body.y) : 50,
    shape: _validShape(body.shape),
    rotation: parseInt(body.rotation) || 0,
  };
  const cw = _clampSize(body.width);  if (cw != null) t.width  = cw;
  const ch = _clampSize(body.height); if (ch != null) t.height = ch;
  tables.push(t);
  _saveTables(tables);
  res.status(201).json({ success: true, table: t });
});

// PATCH /api/tables/layout/save — sauvegarde en lot des positions (mode édition)
//   ⚠ DOIT être défini AVANT /:id pour éviter qu'Express prenne "layout" comme un id
router.patch('/layout/save', auth.requirePerm('tables.admin'), (req, res) => {
  const updates = Array.isArray(req.body && req.body.tables) ? req.body.tables : [];
  if (!updates.length) return res.status(400).json({ error: 'Aucune mise à jour' });
  const tables = _loadTables();
  let changed = 0;
  for (const u of updates) {
    const t = tables.find(x => x.id === parseInt(u.id));
    if (!t) continue;
    if (u.x !== undefined)        t.x = _clampPercent(u.x);
    if (u.y !== undefined)        t.y = _clampPercent(u.y);
    if (u.shape !== undefined)    t.shape = _validShape(u.shape);
    if (u.rotation !== undefined) t.rotation = parseInt(u.rotation) || 0;
    if (u.width !== undefined)    { const w = _clampSize(u.width);  if (w != null) t.width  = w; }
    if (u.height !== undefined)   { const h = _clampSize(u.height); if (h != null) t.height = h; }
    changed++;
  }
  _saveTables(tables);
  res.json({ success: true, updated: changed });
});

// PATCH /api/tables/:id — modifier nom, capacité, zone, position, forme
//   ⚠ DOIT être APRÈS /layout/save pour qu'Express priorise la route spécifique
router.patch('/:id', auth.requirePerm('tables.admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'ID invalide' });
  const tables = _loadTables();
  const t = tables.find(x => x.id === id);
  if (!t) return res.status(404).json({ error: 'Table introuvable' });
  const b = req.body || {};
  if (b.nom !== undefined)      t.nom      = String(b.nom).trim().slice(0, 40);
  if (b.capacite !== undefined) t.capacite = parseInt(b.capacite) || t.capacite;
  if (b.zone !== undefined)     t.zone     = String(b.zone).trim().slice(0, 30);
  if (b.x !== undefined)        t.x        = _clampPercent(b.x);
  if (b.y !== undefined)        t.y        = _clampPercent(b.y);
  if (b.shape !== undefined)    t.shape    = _validShape(b.shape);
  if (b.rotation !== undefined) t.rotation = parseInt(b.rotation) || 0;
  if (b.width !== undefined)    { const w = _clampSize(b.width);  if (w != null) t.width  = w; }
  if (b.height !== undefined)   { const h = _clampSize(b.height); if (h != null) t.height = h; }
  _saveTables(tables);
  res.json({ success: true, table: t });
});

// DELETE /api/tables/:id — supprimer une table (admin)
router.delete('/:id', auth.requirePerm('tables.admin'), (req, res) => {
  const id = parseInt(req.params.id);
  let tables = _loadTables();
  const before = tables.length;
  tables = tables.filter(x => x.id !== id);
  if (tables.length === before) return res.status(404).json({ error: 'Table introuvable' });
  const sessions = _loadSessions();
  delete sessions[id];
  _saveTables(tables);
  _saveSessions(sessions);
  res.json({ success: true });
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
