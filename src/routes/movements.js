'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Stock movements
   Historique des mouvements (entrée/sortie/ajustement) en JSON local.
   Limite naturelle : 5000 dernières lignes (rotation).
   ────────────────────────────────────────────────────────────────────── */

const express  = require('express');
const router   = express.Router();
const storage  = require('../storage');
const auth     = require('../auth');
const supabase = require('../db');
const logs     = require('../logbuffer');

const MAX_ROWS = 5000;

function _all() { return storage.read('movements', []); }
function _save(arr) { storage.write('movements', arr); }
function _nextId(arr) { return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1; }

/** Helper interne, appelé depuis orders.js / stock.js : ne nécessite pas req/res. */
function record({ ingredient_id, type, quantite, raison, ref, user }) {
  const arr = _all();
  const row = {
    id:          _nextId(arr),
    ingredient_id,
    type,                // 'entree' | 'sortie' | 'ajustement'
    quantite:    parseFloat(quantite) || 0,
    raison:      raison || null,
    ref:         ref || null,
    user:        user || null,
    created_at:  new Date().toISOString(),
  };
  arr.push(row);
  if (arr.length > MAX_ROWS) arr.splice(0, arr.length - MAX_ROWS);
  _save(arr);
  return row;
}

router.use(auth.requireAuth);

// GET /api/movements?ingredient_id=&type=&limit=
router.get('/', auth.requirePerm('stock.movements'), async (req, res) => {
  let rows = _all();
  if (req.query.ingredient_id) rows = rows.filter(r => r.ingredient_id == req.query.ingredient_id);
  if (req.query.type)          rows = rows.filter(r => r.type === req.query.type);

  // Joindre les noms des ingrédients si disponibles
  try {
    const { data: ings } = await supabase.from('ingredients').select('id, nom, unite');
    const byId = Object.fromEntries((ings || []).map(i => [i.id, i]));
    rows = rows.map(r => ({ ...r, ingredient_nom: byId[r.ingredient_id]?.nom || `#${r.ingredient_id}`, unite: byId[r.ingredient_id]?.unite || '' }));
  } catch (_) {}

  const limit = Math.min(parseInt(req.query.limit) || 200, MAX_ROWS);
  res.json(rows.slice(-limit).reverse());
});

// POST /api/movements — ajout manuel (admin/manager)
router.post('/', auth.requirePerm('stock.edit'), async (req, res) => {
  const { ingredient_id, type, quantite, raison } = req.body || {};
  if (!ingredient_id || !type || quantite == null) return res.status(400).json({ error: 'ingredient_id, type, quantite requis' });
  if (!['entree', 'sortie', 'ajustement'].includes(type)) return res.status(400).json({ error: 'type invalide' });

  const row = record({ ingredient_id, type, quantite, raison, user: req.user.username });

  // Mettre à jour le stock côté Supabase
  try {
    const { data: ing } = await supabase.from('ingredients').select('stock_actuel').eq('id', ingredient_id).single();
    if (ing) {
      const delta = type === 'sortie' ? -Math.abs(parseFloat(quantite)) : Math.abs(parseFloat(quantite));
      const newStock = type === 'ajustement'
        ? parseFloat(quantite)                    // ajustement = valeur absolue
        : (parseFloat(ing.stock_actuel) + delta); // stock négatif autorisé
      await supabase.from('ingredients').update({ stock_actuel: newStock }).eq('id', ingredient_id);
    }
  } catch (e) { logs.add('warn', 'Mouvement: maj stock échouée', { err: e.message }); }

  logs.add('info', 'Mouvement stock', { type, ingredient_id, qty: quantite, by: req.user.username });
  res.status(201).json(row);
});

module.exports = router;
module.exports.record = record;
