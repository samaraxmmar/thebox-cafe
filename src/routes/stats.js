'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');

router.use(auth.requireAuth);

// Endpoint léger : juste le nombre de commandes du jour (pour la topbar)
// Fenêtre 24h en LOCAL (00:00 → 23:59:59 heure locale serveur)
router.get('/count-today', async (req, res) => {
  try {
    const now = new Date();
    // Début du jour local (heure locale, pas UTC)
    const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endLocal   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = startLocal.toISOString();
    const end   = endLocal.toISOString();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const { count, error } = await supabase
      .from('commandes')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);
    if (error) throw error;
    console.log(`[count-today] ${today} (${start} → ${end}) : ${count || 0} commandes`);
    res.json({ count: count || 0, date: today, window: { start, end } });
  } catch (e) {
    console.warn('[count-today] error', e.message);
    res.json({ count: 0, error: e.message });
  }
});

// Routes complètes nécessitent stats.view
router.use(auth.requirePerm('stats.view'));

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

// GET /api/stats/evolution?days=7&date=YYYY-MM-DD
// L'évolution se termine à la date donnée (par défaut aujourd'hui)
// Optimisé : 1 seule requête couvrant toute la période, agrégation en mémoire
router.get('/evolution', async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 365);
  // Date de fin : query.date ou aujourd'hui
  const endStr = String(req.query.date || '').trim();
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endStr) ? new Date(endStr + 'T12:00:00') : new Date();
  try {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endDate); d.setDate(endDate.getDate() - i);
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

// GET /api/stats/evolution-cats?days=7
// Évolution journalière du CA, ventilée par famille (Boisson Chaude/Froide/Cake/…)
router.get('/evolution-cats', async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 60);
  const families = (() => { try { return require('../families'); } catch (_) { return null; } })();
  const endStr = String(req.query.date || '').trim();
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endStr) ? new Date(endStr + 'T12:00:00') : new Date();

  try {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endDate); d.setDate(endDate.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const { start } = dayRange(dates[0]);
    const { end }   = dayRange(dates[dates.length - 1]);

    // Récup commandes + items + categorie du produit
    const { data: cmds, error } = await supabase
      .from('commandes')
      .select(`
        id, total, created_at,
        commande_items (
          quantite, prix_unitaire,
          produits ( categorie )
        )
      `)
      .gte('created_at', start)
      .lte('created_at', end);
    if (error) throw error;

    // Découvrir les familles utilisées
    const famSet = new Set();
    // Bucket : { date: { family: ca } }
    const buckets = {};
    dates.forEach(d => { buckets[d] = {}; });

    for (const c of (cmds || [])) {
      const day = (c.created_at || '').split('T')[0];
      if (!buckets[day]) continue;
      for (const it of (c.commande_items || [])) {
        const cat  = (it.produits && it.produits.categorie) || 'Divers';
        const fam  = (families && families.familyOf(cat)) || cat || 'Divers';
        famSet.add(fam);
        const line = (parseInt(it.quantite) || 0) * (parseFloat(it.prix_unitaire) || 0);
        buckets[day][fam] = (buckets[day][fam] || 0) + line;
      }
    }

    // Total par jour (somme commandes — plus précis que somme items en cas d'arrondis)
    const totals = {};
    for (const c of (cmds || [])) {
      const day = (c.created_at || '').split('T')[0];
      if (!buckets[day]) continue;
      totals[day] = (totals[day] || 0) + parseFloat(c.total || 0);
    }

    // Format : { dates, families, series: { [family]: [val_d1, val_d2, ...] }, totals: [...] }
    const familiesArr = Array.from(famSet).sort();
    const series = {};
    familiesArr.forEach(f => {
      series[f] = dates.map(d => +(buckets[d][f] || 0).toFixed(3));
    });
    const totalSeries = dates.map(d => +(totals[d] || 0).toFixed(3));

    res.json({ dates, families: familiesArr, series, totals: totalSeries });
  } catch (err) {
    console.error('[EVOLUTION-CATS]', err);
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

    // Hydrate avec l'attribution serveur
    let attrMap = {};
    try {
      const storage = require('../storage');
      const attr = storage.read('commandes_attribution', []) || [];
      for (const a of attr) if (a && a.commande_id != null) attrMap[a.commande_id] = a.serveur;
    } catch (_) {}

    const normalized = (data || []).map(c => ({
      id:         c.id,
      total:      c.total,
      statut:     c.statut,
      created_at: c.created_at,
      table_nom:  c.tables_cafe?.nom || '—',
      serveur:    attrMap[c.id] || null,
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

// GET /api/stats/serveurs?period=day|week|month&date=YYYY-MM-DD
// Performance par serveur — croise commandes Supabase + attribution JSON locale
// La fenêtre se termine à la date donnée (par défaut aujourd'hui)
router.get('/serveurs', async (req, res) => {
  const storage = require('../storage');
  const period  = String(req.query.period || 'day').toLowerCase();
  // Date de référence : query.date ou aujourd'hui
  const refStr  = String(req.query.date || '').trim();
  const ref     = /^\d{4}-\d{2}-\d{2}$/.test(refStr) ? new Date(refStr + 'T12:00:00') : new Date();

  // Calcul de la fenêtre relative à ref
  let startDate, endDate;
  if (period === 'week') {
    startDate = new Date(ref); startDate.setDate(ref.getDate() - 7); startDate.setHours(0,0,0,0);
    endDate   = new Date(ref); endDate.setHours(23,59,59,999);
  } else if (period === 'month') {
    startDate = new Date(ref); startDate.setDate(ref.getDate() - 30); startDate.setHours(0,0,0,0);
    endDate   = new Date(ref); endDate.setHours(23,59,59,999);
  } else {
    // day = la date sélectionnée (00:00 → 23:59 local)
    startDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0);
    endDate   = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
  }
  const startISO = startDate.toISOString();
  const endISO   = endDate.toISOString();

  try {
    // 1) Récup TOUTES les commandes Supabase de la période
    const { data: cmds, error } = await supabase
      .from('commandes')
      .select('id, total, created_at, commande_items ( quantite )')
      .gte('created_at', startISO)
      .lte('created_at', endISO);
    if (error) throw error;

    // 2) Récup attribution JSON locale → map par commande_id
    const attrList = storage.read('commandes_attribution', []) || [];
    const attrMap  = {};
    for (const a of attrList) {
      if (a && a.commande_id != null) attrMap[a.commande_id] = a;
    }

    // 3) Agréger par serveur (fallback "Non attribué" pour les anciennes commandes)
    const agg = {};
    let totalCA = 0, totalCmds = 0, totalItems = 0;
    let nbNonAttr = 0;

    for (const c of (cmds || [])) {
      const a = attrMap[c.id];
      const serveur = (a && a.serveur) ? a.serveur : 'Non attribué';
      const ca = parseFloat(c.total || 0);
      const nbItems = (c.commande_items || []).reduce((s, it) => s + (parseInt(it.quantite) || 0), 0);

      if (!agg[serveur]) agg[serveur] = { serveur, nb_commandes: 0, ca: 0, nb_items: 0 };
      agg[serveur].nb_commandes++;
      agg[serveur].ca       += ca;
      agg[serveur].nb_items += nbItems;

      totalCA    += ca;
      totalCmds  += 1;
      totalItems += nbItems;
      if (!a) nbNonAttr++;
    }

    // Ticket moyen + % du total
    const serveurs = Object.values(agg).map(s => ({
      ...s,
      ticket_moyen: s.nb_commandes ? (s.ca / s.nb_commandes) : 0,
      pct_ca:       totalCA ? (s.ca / totalCA * 100) : 0,
    })).sort((a, b) => b.ca - a.ca);

    res.json({
      period,
      from: startISO,
      to:   endISO,
      totals: { ca: totalCA, nb_commandes: totalCmds, nb_items: totalItems },
      nb_non_attribuees: nbNonAttr,
      serveurs,
    });
  } catch (err) {
    console.error('[STATS/SERVEURS]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stats/serveurs/reattribute  { serveur: "Manel", scope: "non_attribuees"|"all", period: "day"|"week"|"month"|"all" }
// Attribue toutes les commandes (non attribuées ou toutes) à un serveur cible
router.post('/serveurs/reattribute', auth.requirePerm('stats.view'), async (req, res) => {
  const storage = require('../storage');
  const body    = req.body || {};
  const serveur = String(body.serveur || '').trim().slice(0, 80);
  const scope   = String(body.scope   || 'non_attribuees');
  const period  = String(body.period  || 'all');

  if (!serveur) return res.status(400).json({ error: 'Nom de serveur requis' });

  // Calcul fenêtre
  const now = new Date();
  let startISO = null, endISO = null;
  if (period !== 'all') {
    let s;
    if (period === 'week')       { s = new Date(now); s.setDate(now.getDate() - 7); s.setHours(0,0,0,0); }
    else if (period === 'month') { s = new Date(now); s.setDate(now.getDate() - 30); s.setHours(0,0,0,0); }
    else                         { s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0); }
    startISO = s.toISOString();
    endISO   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).toISOString();
  }

  try {
    // 1) Récup commandes Supabase de la période
    let query = supabase.from('commandes').select('id, total, created_at, commande_items ( quantite )');
    if (startISO) query = query.gte('created_at', startISO).lte('created_at', endISO);
    const { data: cmds, error } = await query;
    if (error) throw error;

    // 2) Charger attribution actuelle
    const attr = storage.read('commandes_attribution', []) || [];
    const idx  = {};
    for (let i = 0; i < attr.length; i++) {
      if (attr[i] && attr[i].commande_id != null) idx[attr[i].commande_id] = i;
    }

    let updated = 0, added = 0;
    for (const c of (cmds || [])) {
      const nbItems = (c.commande_items || []).reduce((s, it) => s + (parseInt(it.quantite) || 0), 0);
      const entry = {
        commande_id: c.id,
        serveur:     serveur,
        total:       parseFloat(c.total || 0),
        nb_items:    nbItems,
        table_id:    null,
        created_at:  c.created_at,
        reattributed_at: new Date().toISOString(),
        reattributed_by: (req.user && req.user.username) || 'admin',
      };
      const existingIdx = idx[c.id];
      if (existingIdx != null) {
        // Si scope="non_attribuees" : ne touche pas les déjà attribuées
        if (scope === 'non_attribuees' && attr[existingIdx].serveur) continue;
        // Préserver created_at d'origine
        const prev = attr[existingIdx];
        entry.created_at = prev.created_at || entry.created_at;
        attr[existingIdx] = entry;
        updated++;
      } else {
        attr.push(entry);
        added++;
      }
    }

    storage.write('commandes_attribution', attr);
    console.log(`[REATTRIBUTE] → ${serveur} : ${added} ajoutées, ${updated} mises à jour (scope=${scope}, period=${period})`);
    res.json({ success: true, serveur, added, updated, total: added + updated });
  } catch (err) {
    console.error('[REATTRIBUTE]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;