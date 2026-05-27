'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');

// GET /api/produits — tous les produits actifs avec leurs recettes
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('produits')
    .select(`
      id, nom, prix, categorie, actif,
      recettes ( ingredient_id, quantite,
        ingredients ( nom, unite )
      )
    `)
    .order('categorie')
    .order('nom');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/produits — créer un produit + sa recette
router.post('/', async (req, res) => {
  const { nom, prix, categorie, recette = [] } = req.body;

  if (!nom || !prix) return res.status(400).json({ error: 'nom et prix requis' });

  const { data: produit, error } = await supabase
    .from('produits')
    .insert({ nom, prix, categorie, actif: true })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  if (recette.length > 0) {
    const rows = recette.map(r => ({
      produit_id:    produit.id,
      ingredient_id: r.ingredient_id,
      quantite:      r.quantite,
    }));
    const { error: recErr } = await supabase.from('recettes').insert(rows);
    if (recErr) return res.status(500).json({ error: recErr.message });
  }

  res.status(201).json({ success: true, produit });
});

// PATCH /api/produits/:id/toggle — activer / désactiver
router.patch('/:id/toggle', async (req, res) => {
  const { actif } = req.body;
  const { error } = await supabase
    .from('produits')
    .update({ actif })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// DELETE /api/produits/:id — supprimer produit + recettes liées
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  await supabase.from('recettes').delete().eq('produit_id', id);
  const { error } = await supabase.from('produits').delete().eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
