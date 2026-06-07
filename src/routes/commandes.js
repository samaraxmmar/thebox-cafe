'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');
let logs;
try { logs = require('../logbuffer'); } catch (_) { logs = { add: () => {} }; }

router.use(auth.requireAuth);

/* Helper : début/fin ISO d'une date YYYY-MM-DD */
function dayBounds(date) {
  return {
    start: new Date(`${date}T00:00:00`).toISOString(),
    end:   new Date(`${date}T23:59:59.999`).toISOString(),
  };
}

function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

// GET /api/commandes — historique (100 dernières) + table + serveur
router.get('/', auth.requirePerm('orders.history'), async (req, res) => {
  const { data, error } = await supabase
    .from('commandes')
    .select(`
      id, total, statut, created_at, table_id,
      tables_cafe ( nom ),
      commande_items (
        quantite, prix_unitaire,
        produits ( nom )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });

  // Hydrate avec l'attribution serveur (JSON locale)
  let attrMap = {};
  try {
    const storage = require('../storage');
    const attr = storage.read('commandes_attribution', []) || [];
    for (const a of attr) if (a && a.commande_id != null) attrMap[a.commande_id] = a.serveur;
  } catch (_) {}

  const out = (data || []).map(c => ({
    ...c,
    table_nom: (c.tables_cafe && c.tables_cafe.nom) ? c.tables_cafe.nom : null,
    serveur:   attrMap[c.id] || null,
  }));
  res.json(out);
});

// PATCH /api/commandes/:id/cancel — annuler
router.patch('/:id/cancel', auth.requirePerm('orders.cancel'), async (req, res) => {
  const { error } = await supabase
    .from('commandes').update({ statut: 'annulee' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/commandes/by-date/preview?date=YYYY-MM-DD
//   Aperçu : combien de commandes seront supprimées et pour quel total.
router.get('/by-date/preview', auth.requirePerm('orders.delete'), async (req, res) => {
  const date = String(req.query.date || '');
  if (!isValidDate(date)) return res.status(400).json({ error: 'Date invalide (format YYYY-MM-DD)' });
  const { start, end } = dayBounds(date);
  try {
    const { data, error } = await supabase
      .from('commandes')
      .select('id, total')
      .gte('created_at', start)
      .lte('created_at', end);
    if (error) throw error;
    const count = (data || []).length;
    const total = (data || []).reduce((s, c) => s + parseFloat(c.total || 0), 0);
    res.json({ date, count, total });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erreur' });
  }
});

// DELETE /api/commandes/by-date?date=YYYY-MM-DD
//   Supprime DÉFINITIVEMENT toutes les commandes (+ leurs items) d'une date.
router.delete('/by-date', auth.requirePerm('orders.delete'), async (req, res) => {
  const date = String(req.query.date || '');
  if (!isValidDate(date)) return res.status(400).json({ error: 'Date invalide (format YYYY-MM-DD)' });
  const { start, end } = dayBounds(date);
  try {
    // 1) Lister les IDs concernés
    const { data: cmds, error: e1 } = await supabase
      .from('commandes')
      .select('id, total')
      .gte('created_at', start)
      .lte('created_at', end);
    if (e1) throw e1;

    const ids = (cmds || []).map(c => c.id);
    if (!ids.length) return res.json({ success: true, deleted: 0, total: 0 });

    // 2) Supprimer les lignes de détail (FK)
    const { error: e2 } = await supabase
      .from('commande_items')
      .delete()
      .in('commande_id', ids);
    if (e2) throw e2;

    // 3) Supprimer les commandes
    const { error: e3 } = await supabase
      .from('commandes')
      .delete()
      .in('id', ids);
    if (e3) throw e3;

    const total = (cmds || []).reduce((s, c) => s + parseFloat(c.total || 0), 0);
    logs.add('warn', `Suppression commandes du ${date}`, {
      by: req.user.username, count: ids.length, total: total.toFixed(3),
    });

    res.json({ success: true, deleted: ids.length, total });
  } catch (e) {
    console.error('[COMMANDES] delete by-date:', e.message);
    res.status(500).json({ error: e.message || 'Erreur suppression' });
  }
});

// DELETE /api/commandes/:id — supprimer une seule commande
router.delete('/:id', auth.requirePerm('orders.delete'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalide' });
  try {
    await supabase.from('commande_items').delete().eq('commande_id', id);
    const { error } = await supabase.from('commandes').delete().eq('id', id);
    if (error) throw error;
    logs.add('warn', `Suppression commande #${id}`, { by: req.user.username });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
