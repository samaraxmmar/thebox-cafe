'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');

router.use(auth.requireAuth);

// GET /api/commandes — historique (100 dernières)
router.get('/', auth.requirePerm('orders.history'), async (req, res) => {
  const { data, error } = await supabase
    .from('commandes')
    .select(`
      id, total, statut, created_at,
      commande_items (
        quantite, prix_unitaire,
        produits ( nom )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/commandes/:id/cancel — annuler
router.patch('/:id/cancel', auth.requirePerm('orders.cancel'), async (req, res) => {
  const { error } = await supabase
    .from('commandes').update({ statut: 'annulee' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
