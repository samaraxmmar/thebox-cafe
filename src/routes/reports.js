'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Reports
   - Z journalier / mensuel / annuel / période personnalisée
   - Exports CSV (Excel ouvre nativement)
   - Top produits / moins vendus / marges (si coûts dispos)
   ────────────────────────────────────────────────────────────────────── */

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');
const storage  = require('../storage');

async function safe(builder) {
  try { return await builder; } catch (err) { return { data: null, error: err }; }
}

router.use(auth.requireAuth);

function dayBounds(date) {
  return {
    start: new Date(`${date}T00:00:00`).toISOString(),
    end:   new Date(`${date}T23:59:59.999`).toISOString(),
  };
}
function monthBounds(yyyy, mm) {
  const start = new Date(Date.UTC(yyyy, mm - 1, 1)).toISOString();
  const end   = new Date(Date.UTC(yyyy, mm, 0, 23, 59, 59, 999)).toISOString();
  return { start, end };
}
function yearBounds(yyyy) {
  const start = new Date(Date.UTC(yyyy, 0, 1)).toISOString();
  const end   = new Date(Date.UTC(yyyy, 11, 31, 23, 59, 59, 999)).toISOString();
  return { start, end };
}

async function loadOrders(start, end) {
  const { data, error } = await safe(
    supabase.from('commandes')
      .select(`id, total, statut, created_at, table_id,
               commande_items ( quantite, prix_unitaire, produit_id, produits ( nom, categorie ) )`)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
  );
  if (error) throw error;
  return data || [];
}

function aggregate(cmds, settings) {
  const tva   = parseFloat(settings?.pos?.tva     || 0) / 100;
  const total = cmds.reduce((s, c) => s + parseFloat(c.total || 0), 0);
  const ht    = tva > 0 ? total / (1 + tva) : total;
  const taxes = total - ht;

  // par produit
  const map = {};
  for (const c of cmds) {
    for (const i of (c.commande_items || [])) {
      const nom = i.produits?.nom || '?';
      const cat = i.produits?.categorie || '—';
      if (!map[nom]) map[nom] = { nom, categorie: cat, qty: 0, revenu: 0 };
      map[nom].qty    += i.quantite;
      map[nom].revenu += i.quantite * parseFloat(i.prix_unitaire || 0);
    }
  }
  const parProduit = Object.values(map).sort((a, b) => b.qty - a.qty);

  // par catégorie
  const cat = {};
  for (const p of parProduit) {
    if (!cat[p.categorie]) cat[p.categorie] = { categorie: p.categorie, qty: 0, revenu: 0 };
    cat[p.categorie].qty    += p.qty;
    cat[p.categorie].revenu += p.revenu;
  }
  const parCategorie = Object.values(cat).sort((a, b) => b.revenu - a.revenu);

  // par heure
  const h = {};
  for (const c of cmds) {
    const hr = new Date(c.created_at).getHours();
    if (!h[hr]) h[hr] = { heure: hr, nb: 0, ca: 0 };
    h[hr].nb++; h[hr].ca += parseFloat(c.total || 0);
  }
  const parHeure = Object.values(h).sort((a, b) => a.heure - b.heure);

  return {
    nb_commandes: cmds.length,
    total_ttc:    total,
    total_ht:     ht,
    taxes,
    tva_taux:     tva * 100,
    panier_moyen: cmds.length ? total / cmds.length : 0,
    top_produit:  parProduit[0] || null,
    flop_produit: parProduit[parProduit.length - 1] || null,
    par_produit:  parProduit,
    par_categorie: parCategorie,
    par_heure:    parHeure,
  };
}

/* ── Z journalier ──────────────────────────────────────── */
router.get('/z-jour', auth.requirePerm('reports.z'), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const settings = storage.read('settings', {});
    const { start, end } = dayBounds(date);
    const cmds = await loadOrders(start, end);
    res.json({ date, ...aggregate(cmds, settings) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Z mensuel ─────────────────────────────────────────── */
router.get('/z-mois', auth.requirePerm('reports.z'), async (req, res) => {
  try {
    const today = new Date();
    const yyyy = parseInt(req.query.year)  || today.getFullYear();
    const mm   = parseInt(req.query.month) || (today.getMonth() + 1);
    const settings = storage.read('settings', {});
    const { start, end } = monthBounds(yyyy, mm);
    const cmds = await loadOrders(start, end);

    // CA par jour
    const byDay = {};
    for (const c of cmds) {
      const d = c.created_at.split('T')[0];
      if (!byDay[d]) byDay[d] = { date: d, ca: 0, nb: 0 };
      byDay[d].ca += parseFloat(c.total || 0); byDay[d].nb++;
    }
    res.json({ year: yyyy, month: mm, ...aggregate(cmds, settings), par_jour: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── États période personnalisée ───────────────────────── */
router.get('/etats', auth.requirePerm('stats.view'), async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to   = req.query.to   || from;
    const settings = storage.read('settings', {});
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end   = new Date(`${to}T23:59:59.999`).toISOString();
    const cmds = await loadOrders(start, end);
    res.json({ from, to, ...aggregate(cmds, settings) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Valorisation stock ────────────────────────────────── */
router.get('/valorisation', auth.requirePerm('stats.view'), async (req, res) => {
  try {
    const { data: ings } = await safe(supabase.from('ingredients').select('*'));
    const items = (ings || []).map(i => {
      const cu = parseFloat(i.cout_unitaire || 0);
      const stk = parseFloat(i.stock_actuel || 0);
      return { id: i.id, nom: i.nom, unite: i.unite, stock: stk, cout_unitaire: cu, valeur: cu * stk };
    });
    const total = items.reduce((s, x) => s + x.valeur, 0);
    res.json({ total, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Export CSV ─────────────────────────────────────────
   /api/reports/export?kind=etats|produits|valorisation&from=&to= */
router.get('/export', auth.requirePerm('stats.export'), async (req, res) => {
  try {
    const kind = req.query.kind || 'etats';
    const settings = storage.read('settings', {});

    if (kind === 'valorisation') {
      const { data: ings } = await safe(supabase.from('ingredients').select('*'));
      const rows = (ings || []).map(i => [i.id, i.nom, i.unite, i.stock_actuel, i.cout_unitaire || 0, ((i.cout_unitaire||0) * (i.stock_actuel||0)).toFixed(3)]);
      return sendCsv(res, 'valorisation', ['ID','Nom','Unité','Stock','Coût unit.','Valeur'], rows);
    }

    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to   = req.query.to   || from;
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end   = new Date(`${to}T23:59:59.999`).toISOString();
    const cmds  = await loadOrders(start, end);

    if (kind === 'produits') {
      const agg = aggregate(cmds, settings);
      const rows = agg.par_produit.map(p => [p.nom, p.categorie, p.qty, p.revenu.toFixed(3)]);
      return sendCsv(res, `produits_${from}_${to}`, ['Produit','Catégorie','Quantité','Revenu DT'], rows);
    }

    if (kind === 'commandes') {
      const rows = cmds.map(c => [c.id, c.created_at, c.statut, parseFloat(c.total).toFixed(3),
        (c.commande_items || []).map(i => `${i.quantite}x ${i.produits?.nom || '?'}`).join(' | ')]);
      return sendCsv(res, `commandes_${from}_${to}`, ['ID','Date','Statut','Total DT','Items'], rows);
    }

    // etats par défaut
    const agg = aggregate(cmds, settings);
    const rows = [
      ['Du', from], ['Au', to],
      ['Commandes', agg.nb_commandes],
      ['Total TTC', agg.total_ttc.toFixed(3)],
      ['Total HT',  agg.total_ht.toFixed(3)],
      ['TVA',       agg.taxes.toFixed(3)],
      ['Panier moyen', agg.panier_moyen.toFixed(3)],
      ['Top produit', agg.top_produit?.nom || '—'],
    ];
    return sendCsv(res, `etats_${from}_${to}`, ['Indicateur','Valeur'], rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function sendCsv(res, basename, headers, rows) {
  const esc = v => {
    const s = (v == null ? '' : String(v));
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const body  = '﻿' + lines.join('\r\n'); // BOM pour Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${basename}.csv"`);
  res.send(body);
}

module.exports = router;
