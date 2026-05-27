'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Stock
   Stock géré via overlay local (data/stock.json) — pas de migration SQL.
   Seuls les produits SUIVIS apparaissent ici.
   ────────────────────────────────────────────────────────────────────── */

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const wa       = require('../whatsapp');
const auth     = require('../auth');
const V        = require('../validate');
const overlay  = require('../stock_overlay');
let movements;
try { movements = require('./movements'); } catch (_) { movements = { record: () => {} }; }

router.use(auth.requireAuth);

// GET /api/stock — uniquement les produits SUIVIS (avec stock défini)
router.get('/', auth.requirePerm('stock.view'), async (req, res) => {
  const ids = overlay.trackedIds();
  if (!ids.length) return res.json([]);

  const { data, error } = await supabase
    .from('produits').select('*').in('id', ids).order('nom');
  if (error) return res.status(500).json({ error: error.message });

  res.json(overlay.augmentProducts(data || []));
});

// PATCH /api/stock/:id — réapprovisionner (ajouter au stock)
router.patch('/:id', auth.requirePerm('stock.edit'), async (req, res) => {
  const id  = V.intPos(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });
  const qty = V.num(req.body && req.body.quantite, { min: 0.0001, max: 1_000_000 });
  if (qty == null) return res.status(400).json({ error: 'quantite invalide' });

  // Vérifier que le produit existe
  const { data: prod } = await supabase
    .from('produits').select('id, nom').eq('id', id).maybeSingle();
  if (!prod) return res.status(404).json({ error: 'Produit #' + id + ' introuvable' });

  // Mettre à jour l'overlay (crée l'entrée si elle n'existe pas)
  const cur = overlay.get(id) || { stock: 0, seuil: 5, cout: 0 };
  const next = overlay.set(id, { stock: cur.stock + qty, seuil: cur.seuil, cout: cur.cout });

  try { movements.record({ ingredient_id: id, type: 'entree', quantite: qty, raison: 'Réappro', user: req.user.username }); } catch (_) {}
  try { wa.send(`The Box — Réappro\n${prod.nom} : +${qty} unité → stock : ${next.stock}`); } catch (_) {}

  res.json({ success: true, new_stock: next.stock });
});

// POST /api/stock — déclarer le suivi de stock pour un produit existant
//   body: { produit_id, stock_actuel, seuil_minimum?, cout_unitaire? }
router.post('/', auth.requirePerm('stock.edit'), async (req, res) => {
  const body = req.body || {};
  const id    = V.intPos(body.produit_id);
  const stock = V.num(body.stock_actuel, { min: 0, max: 1_000_000 });
  const seuil = V.num(body.seuil_minimum, { min: 0, max: 1_000_000 }) || 5;
  const cout  = body.cout_unitaire != null ? V.num(body.cout_unitaire, { min: 0, max: 100_000 }) : 0;

  if (!id)            return res.status(400).json({ error: 'produit_id requis' });
  if (stock == null)  return res.status(400).json({ error: 'stock_actuel requis' });

  const { data: prod } = await supabase.from('produits').select('id, nom').eq('id', id).maybeSingle();
  if (!prod) return res.status(404).json({ error: 'Produit introuvable' });

  overlay.set(id, { stock, seuil, cout });
  res.status(201).json({ success: true, produit_id: id, stock, seuil, cout });
});

// DELETE /api/stock/:id — retirer le suivi (ne supprime pas le produit)
router.delete('/:id', auth.requirePerm('stock.edit'), async (req, res) => {
  const id = V.intPos(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });
  overlay.remove(id);
  res.json({ success: true, mode: 'untracked' });
});

module.exports = router;
