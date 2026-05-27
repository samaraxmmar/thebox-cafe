'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Produits
   Stock OPTIONNEL par produit :
   - Si l'utilisateur saisit stock_initial > 0 → le produit est suivi
   - Sinon → pas de stock, pas de rupture
   Stock stocké en local JSON (data/stock.json) → fonctionne sans migration SQL.
   ────────────────────────────────────────────────────────────────────── */

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');
const V        = require('../validate');
const overlay  = require('../stock_overlay');

router.use(auth.requireAuth);

// GET /api/produits — produits enrichis du stock local
router.get('/', auth.requirePerm('products.view'), async (req, res) => {
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .order('categorie')
    .order('nom');
  if (error) {
    console.error('[PRODUITS] GET error:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.json(overlay.augmentProducts(data || []));
});

// POST /api/produits
router.post('/', auth.requirePerm('products.edit'), async (req, res) => {
  const body = req.body || {};
  const nom       = V.cleanName(body.nom, 80);
  const prix      = V.num(body.prix, { min: 0, max: 100_000 });
  const categorie = V.cleanName(body.categorie, 40) || 'Boisson chaude';
  const stockInit = V.num(body.stock_initial ?? body.stock_actuel, { min: 0, max: 1_000_000 }) || 0;
  const seuil     = V.num(body.seuil_minimum, { min: 0, max: 1_000_000 }) || 0;
  const cout      = body.cout_unitaire != null ? V.num(body.cout_unitaire, { min: 0, max: 100_000 }) : 0;

  if (!nom)         return res.status(400).json({ error: 'nom requis' });
  if (prix == null) return res.status(400).json({ error: 'prix invalide' });

  // ── 1) Créer le produit (uniquement champs garantis présents en BD) ──
  const payload = { nom, prix, categorie, actif: true };
  const { data, error } = await supabase
    .from('produits').insert(payload).select().single();
  if (error) {
    console.error('[PRODUITS] POST error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  // ── 2) Stock local SEULEMENT si l'utilisateur a saisi un stock > 0 ──
  let tracked = false;
  if (stockInit > 0) {
    overlay.set(data.id, { stock: stockInit, seuil: seuil || 5, cout });
    tracked = true;
  }

  res.status(201).json({
    success: true,
    produit: { ...data, stock_actuel: tracked ? stockInit : null, seuil_minimum: tracked ? (seuil || 5) : null, tracked },
  });
});

// PATCH /api/produits/:id
router.patch('/:id', auth.requirePerm('products.edit'), async (req, res) => {
  const id = V.intPos(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  const allowed = ['nom', 'prix', 'categorie', 'actif'];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('produits').update(patch).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
  }
  // Mise à jour overlay (stock/seuil/coût)
  if ('stock_actuel' in (req.body || {}) || 'seuil_minimum' in (req.body || {}) || 'cout_unitaire' in (req.body || {})) {
    const cur = overlay.get(id) || { stock: 0, seuil: 0, cout: 0 };
    overlay.set(id, {
      stock: req.body.stock_actuel  != null ? req.body.stock_actuel  : cur.stock,
      seuil: req.body.seuil_minimum != null ? req.body.seuil_minimum : cur.seuil,
      cout:  req.body.cout_unitaire != null ? req.body.cout_unitaire : cur.cout,
    });
  }
  res.json({ success: true });
});

// PATCH /api/produits/:id/toggle
router.patch('/:id/toggle', auth.requirePerm('products.edit'), async (req, res) => {
  const { actif } = req.body || {};
  const { error } = await supabase
    .from('produits').update({ actif: !!actif }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// DELETE /api/produits/:id — suppression définitive
router.delete('/:id', auth.requirePerm('products.edit'), async (req, res) => {
  const id = V.intPos(req.params.id);
  if (!id) return res.status(400).json({ error: 'id invalide' });

  // Nettoyer les FK (au cas où ON DELETE CASCADE pas configuré)
  try { await supabase.from('commande_items').delete().eq('produit_id', id); } catch (_) {}
  try { await supabase.from('recettes').delete().eq('produit_id', id); }       catch (_) {}

  const { error } = await supabase.from('produits').delete().eq('id', id);
  if (error) {
    console.error('[PRODUITS] DELETE:', error.message);
    return res.status(500).json({ error: error.message });
  }
  overlay.remove(id);
  res.json({ success: true, mode: 'deleted' });
});

module.exports = router;
