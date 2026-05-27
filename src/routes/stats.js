'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');

router.use(auth.requireAuth, auth.requirePerm('stats.view'));

// Construit la fenêtre [début, fin] en ISO pour un jour local (Tunis UTC+1)
function dayRange(dateStr) {
  // Si tu veux rester en UTC pur, garde l'ancien format.
  // Ici on prend une fenêtre large de 24h autour du jour local.
  const start = new Date(`${dateStr}T00:00:00`);
  const end   = new Date(`${dateStr}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

// GET /api/stats?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const { start, end } = dayRange(date);

  try {
    const { data: commandes, error: e1 } = await supabase
      .from('commandes')
      .select(`
        id, total, statut, created_at,
        commande_items ( quantite, prix_unitaire, produits ( nom ) )
      `)
      .gte('created_at', start)
      .lte('created_at', end);
    if (e1) throw e1;

    const cmds   = commandes || [];
    const total  = cmds.reduce((s, c) => s + parseFloat(c.total || 0), 0);
    const nbCmds = cmds.length;

    // Par produit
    const produitMap = {};
    for (const c of cmds) {
      for (const i of (c.commande_items || [])) {
        const nom = i.produits?.nom || '?';
        if (!produitMap[nom]) produitMap[nom] = { nom, qty: 0, revenu: 0 };
        produitMap[nom].qty    += i.quantite;
        produitMap[nom].revenu += i.quantite * parseFloat(i.prix_unitaire || 0);
      }
    }
    const parProduit = Object.values(produitMap).sort((a, b) => b.qty - a.qty);
    const top = parProduit[0] || null;

    // Par heure
    const heureMap = {};
    for (const c of cmds) {
      const h = new Date(c.created_at).getHours();
      if (!heureMap[h]) heureMap[h] = { heure: h, nb: 0, ca: 0 };
      heureMap[h].nb++;
      heureMap[h].ca += parseFloat(c.total || 0);
    }
    const parHeure = Object.values(heureMap).sort((a, b) => a.heure - b.heure);

    // Stocks bas
    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, nom, stock_actuel, seuil_minimum, unite');
    const bas = (ingredients || []).filter(i =>
      parseFloat(i.stock_actuel) < parseFloat(i.seuil_minimum)
    );

    res.json({
      date,
      total,
      nb_commandes: nbCmds,
      top_produit:  top?.nom || null,
      top_count:    top?.qty || 0,
      par_produit:  parProduit,
      par_heure:    parHeure,
      alertes:      bas,
      nb_alertes:   bas.length,
    });
  } catch (err) {
    console.error('[STATS]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/evolution?days=7
// Optimisé : 1 seule requête couvrant toute la période, agrégation en mémoire
// (au lieu de N requêtes séquentielles).
router.get('/evolution', async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  try {
    const today = new Date();
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const { start } = dayRange(dates[0]);
    const { end }   = dayRange(dates[dates.length - 1]);

    const { data: allCmds, error } = await supabase
      .from('commandes')
      .select('total, created_at')
      .gte('created_at', start)
      .lte('created_at', end);
    if (error) throw error;

    // Bucketing par jour
    const buckets = Object.fromEntries(dates.map(d => [d, { date: d, ca: 0, nb_commandes: 0 }]));
    for (const c of (allCmds || [])) {
      const d = (c.created_at || '').split('T')[0];
      if (buckets[d]) { buckets[d].ca += parseFloat(c.total || 0); buckets[d].nb_commandes++; }
    }
    res.json(dates.map(d => buckets[d]));
  } catch (err) {
    console.error('[EVOLUTION]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats/commandes?date=YYYY-MM-DD
router.get('/commandes', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const { start, end } = dayRange(date);
  try {
    const { data, error } = await supabase
      .from('commandes')
      .select(`
        id, total, statut, created_at, table_id,
        commande_items ( quantite, prix_unitaire, produits ( nom ) ),
        tables_cafe ( nom )
      `)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const normalized = (data || []).map(c => ({
      id:         c.id,
      total:      c.total,
      statut:     c.statut,
      created_at: c.created_at,
      table_nom:  c.tables_cafe?.nom || '—',
      items: (c.commande_items || []).map(i => ({
        nom:      i.produits?.nom || '?',
        quantite: i.quantite,
        prix:     i.prix_unitaire,
      })),
    }));
    res.json(normalized);
  } catch (err) {
    console.error('[STATS/CMDS]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;