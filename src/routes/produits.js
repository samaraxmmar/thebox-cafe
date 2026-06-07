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
const families = require('../families');

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
  // image_url : URL absolue OU chemin relatif /uploads/xxx
  const imageRaw  = (body.image_url || body.image || '').toString().trim();
  const image_url = (imageRaw && (/^https?:\/\//i.test(imageRaw) || imageRaw.startsWith('/uploads/')))
    ? imageRaw.slice(0, 500)
    : null;

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

  // ── 2) Persister IMAGE et STOCK dans l'overlay (séparément) ──
  //     L'image SEULE ne déclenche PAS le tracking de stock.
  const tracked = stockInit > 0;
  if (tracked) {
    // Produit suivi : on enregistre tout (stock + image éventuelle)
    overlay.set(data.id, {
      tracked: true,
      stock: stockInit,
      seuil: seuil || 5,
      cout:  cout || 0,
      image: image_url || null,
    });
  } else if (image_url) {
    // Pas de stock à suivre, mais on garde la photo
    overlay.setImage(data.id, image_url);
  }

  res.status(201).json({
    success: true,
    produit: {
      ...data,
      stock_actuel:  tracked ? stockInit : null,
      seuil_minimum: tracked ? (seuil || 5) : null,
      image_url:     image_url,
      tracked,
    },
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
  // Mise à jour overlay (stock/seuil/coût/image)
  const b = req.body || {};
  const hasStockUpdate = ('stock_actuel' in b || 'seuil_minimum' in b || 'cout_unitaire' in b);
  const hasImageUpdate = ('image_url' in b || 'image' in b);

  if (hasStockUpdate) {
    // Update stock → garde l'image existante, active le tracking
    const cur = overlay.get(id) || { stock: 0, seuil: 5, cout: 0, image: null };
    const newImage = hasImageUpdate
      ? (('image_url' in b ? b.image_url : b.image) || null)
      : cur.image;
    overlay.set(id, {
      tracked: true,        // dès qu'on update le stock, on active le tracking
      stock: b.stock_actuel  != null ? b.stock_actuel  : cur.stock,
      seuil: b.seuil_minimum != null ? b.seuil_minimum : cur.seuil,
      cout:  b.cout_unitaire != null ? b.cout_unitaire : cur.cout,
      image: newImage,
    });
  } else if (hasImageUpdate) {
    // Update IMAGE seule → NE PAS toucher au tracking ni au stock
    const newImage = ('image_url' in b ? b.image_url : b.image) || null;
    overlay.setImage(id, newImage);
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

// GET /api/produits/categories — liste catégories avec count + famille
router.get('/categories', auth.requirePerm('products.view'), async (req, res) => {
  const { data, error } = await supabase.from('produits').select('categorie');
  if (error) return res.status(500).json({ error: error.message });
  const counts = {};
  (data || []).forEach(r => {
    const c = (r.categorie || 'Divers').trim();
    counts[c] = (counts[c] || 0) + 1;
  });
  res.json(Object.keys(counts).sort().map(name => ({
    name, count: counts[name], family: families.familyOf(name) || null,
  })));
});

// ── FAMILLES ─────────────────────────────────────────
// GET /api/produits/families — liste des familles + mapping
router.get('/families', auth.requirePerm('products.view'), (req, res) => {
  res.json(families.getAll());
});

// POST /api/produits/families — créer une nouvelle famille
router.post('/families', auth.requirePerm('products.edit'), (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'name requis' });
  res.json({ success: true, data: families.addFamily(name) });
});

// PATCH /api/produits/families/:name — renommer
router.patch('/families/:name', auth.requirePerm('products.edit'), (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  if (!to) return res.status(400).json({ error: 'to requis' });
  res.json({ success: true, data: families.renameFamily(req.params.name, to) });
});

// DELETE /api/produits/families/:name — supprimer
router.delete('/families/:name', auth.requirePerm('products.edit'), (req, res) => {
  res.json({ success: true, data: families.deleteFamily(req.params.name) });
});

// POST /api/produits/categories/assign — affecter une cat à une famille
router.post('/categories/assign', auth.requirePerm('products.edit'), (req, res) => {
  const category = String((req.body || {}).category || '').trim();
  const family   = (req.body || {}).family;   // peut être null pour désassigner
  if (!category) return res.status(400).json({ error: 'category requise' });
  res.json({ success: true, data: families.assign(category, family || null) });
});

// POST /api/produits/categories/rename — renomme une catégorie pour tous les produits
router.post('/categories/rename', auth.requirePerm('products.edit'), async (req, res) => {
  const from = String((req.body || {}).from || '').trim();
  const to   = String((req.body || {}).to   || '').trim().slice(0, 40);
  if (!from || !to)        return res.status(400).json({ error: 'from et to requis' });
  if (from === to)         return res.json({ success: true, updated: 0 });
  const { data, error } = await supabase
    .from('produits').update({ categorie: to }).eq('categorie', from).select('id');
  if (error) return res.status(500).json({ error: error.message });
  // Propage le rename au mapping famille (conserve la famille)
  try { families.renameCategory(from, to); } catch (_) {}
  res.json({ success: true, updated: (data || []).length, from, to });
});

// POST /api/produits/categories/delete — supprime une catégorie (déplace produits vers moveTo)
router.post('/categories/delete', auth.requirePerm('products.edit'), async (req, res) => {
  const name   = String((req.body || {}).name   || '').trim();
  const moveTo = String((req.body || {}).moveTo || 'Divers').trim().slice(0, 40) || 'Divers';
  const purge  = !!(req.body || {}).purge;        // si true → DELETE les produits au lieu de déplacer
  if (!name) return res.status(400).json({ error: 'name requis' });

  if (purge) {
    // Suppression des produits + nettoyage FK + overlay
    const { data: prods } = await supabase
      .from('produits').select('id').eq('categorie', name);
    const ids = (prods || []).map(p => p.id);
    if (ids.length) {
      try { await supabase.from('commande_items').delete().in('produit_id', ids); } catch (_) {}
      try { await supabase.from('recettes').delete().in('produit_id', ids); }       catch (_) {}
      const { error } = await supabase.from('produits').delete().in('id', ids);
      if (error) return res.status(500).json({ error: error.message });
      ids.forEach(id => overlay.remove(id));
    }
    try { families.removeCategory(name); } catch (_) {}
    return res.json({ success: true, mode: 'purged', count: ids.length });
  }

  // Sinon : déplacement vers moveTo
  const { data, error } = await supabase
    .from('produits').update({ categorie: moveTo }).eq('categorie', name).select('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, mode: 'moved', count: (data || []).length, moveTo });
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
