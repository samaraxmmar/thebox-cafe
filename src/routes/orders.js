'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Orders
   Une commande peut TOUJOURS être créée — stock négatif autorisé.
   Aucune validation "stock insuffisant" ne bloque la vente.
   Le stock négatif indique simplement une rupture à réapprovisionner.
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

// Toujours autoriser le stock négatif — politique caisse stricte
const allowNegativeStock = true;

/* Wrapper safe pour les thenables Supabase (évite .catch is not a function). */
async function dbRun(builder) {
  try { return await builder; }
  catch (err) { return { error: err, data: null }; }
}

router.post('/', auth.requireAuth, auth.requirePerm('orders.create'), async (req, res) => {
  try {
    const body  = req.body || {};
    let items = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(items)) {
      if (items && Array.isArray(items.items)) items = items.items;
      else items = [];
    }

    // Limite anti-DoS : pas plus de 200 lignes par commande
    if (items.length > 200) items = items.slice(0, 200);

    // Nettoyage strict des items
    items = items
      .map(it => ({
        produit_id: V.intPos(it && it.produit_id),
        nom:        V.str(it && it.nom, 100),
        prix:       V.num(it && it.prix,     { min: 0, max: 100_000 }),
        quantite:   V.intPos(it && it.quantite, { max: 10_000 }),
        recette:    Array.isArray(it && it.recette) ? it.recette.slice(0, 50) : [],
      }))
      .filter(it => it.produit_id != null && it.prix != null && it.quantite);

    const session_id = V.intPos(body.session_id);
    const table_id   = V.intPos(body.table_id);

    if (!items.length) return res.status(400).json({ error: 'Commande vide' });

    // ── Total ────────────────────────────────────────────────────
    let total = 0;
    for (const it of items) total += it.prix * it.quantite;
    // Safety cap : refuser une commande absurde (>1M DT) — protection BD
    if (total > 1_000_000) return res.status(400).json({ error: 'Total commande trop élevé' });

    // ── 1) Créer la commande ─────────────────────────────────────
    // Les FK session_id et table_id pointent vers des tables Supabase qui peuvent
    // ne pas contenir les lignes correspondantes (sessions locales JSON).
    // → on vérifie l'existence avant l'insert, sinon on met null.
    let safeSessionId = null;
    let safeTableId   = null;
    if (session_id) {
      const r = await dbRun(supabase.from('sessions_table').select('id').eq('id', session_id).maybeSingle());
      if (r && r.data && r.data.id) safeSessionId = r.data.id;
    }
    if (table_id) {
      const r = await dbRun(supabase.from('tables_cafe').select('id').eq('id', table_id).maybeSingle());
      if (r && r.data && r.data.id) safeTableId = r.data.id;
    }

    // Construire l'insert : on n'inclut les FK QUE si elles existent vraiment
    const insertPayload = { total, statut: 'payee' };
    if (safeSessionId) insertPayload.session_id = safeSessionId;
    if (safeTableId)   insertPayload.table_id   = safeTableId;

    let cmdResult = await dbRun(
      supabase.from('commandes').insert(insertPayload).select().single()
    );

    // Retry sans aucune FK si l'insert échoue à cause d'une contrainte
    if (cmdResult.error && /foreign key|fkey/i.test(cmdResult.error.message || '')) {
      console.warn('[ORDER] FK error — retry sans session_id/table_id:', cmdResult.error.message);
      cmdResult = await dbRun(
        supabase.from('commandes').insert({ total, statut: 'payee' }).select().single()
      );
    }

    if (cmdResult.error) {
      console.error('[ORDER] Création commande:', cmdResult.error.message || cmdResult.error);
      return res.status(500).json({ error: cmdResult.error.message || 'Erreur création commande' });
    }
    const commande = cmdResult.data;

    // ── 2) Lignes de commande ────────────────────────────────────
    const cmdItems = items.map(i => ({
      commande_id:   commande.id,
      produit_id:    i.produit_id,
      quantite:      parseInt(i.quantite),
      prix_unitaire: parseFloat(i.prix),
    }));
    await dbRun(supabase.from('commande_items').insert(cmdItems));

    // ── 3) Décrément du stock — SEULEMENT pour les produits SUIVIS ──
    //     (overlay JSON local). Les produits non suivis n'ont pas de stock.
    //     Vente JAMAIS bloquée même si stock négatif.
    const ruptures = [];
    for (const it of items) {
      const cur = overlay.get(it.produit_id);
      // Si pas d'entrée overlay OU entrée présente juste pour l'image (tracked:false),
      // on ne décrémente RIEN. Crucial : adjust() renvoie null si tracked!==true.
      if (!cur || !cur.tracked) continue;

      const consumed = parseInt(it.quantite);
      const before = cur.stock;
      const next = overlay.adjust(it.produit_id, -consumed, allowNegativeStock);
      if (!next) continue;   // sécurité supplémentaire

      // Récup nom du produit (pour log/WhatsApp)
      let prodNom = '?';
      try {
        const pr = await dbRun(supabase.from('produits').select('nom').eq('id', it.produit_id).maybeSingle());
        if (pr && pr.data && pr.data.nom) prodNom = pr.data.nom;
      } catch (_) {}

      try { movements.record({
        ingredient_id: it.produit_id,
        type: 'sortie', quantite: consumed,
        raison: `Vente cmd #${commande.id}`,
        ref:    `commande:${commande.id}`,
        user:   (req.user && req.user.username) || 'caisse',
      }); } catch (_) {}

      const seuil = cur.seuil || 0;
      const crossedThreshold = before >= seuil && next.stock < seuil && seuil > 0;
      if (next.stock < 0) ruptures.push({ nom: prodNom, stock: next.stock });

      if (crossedThreshold) {
        try { await wa.send(`ALERTE The Box — STOCK BAS\n${prodNom} : ${next.stock} unité(s)\nCommande #${commande.id}`); } catch (_) {}
      }
    }

    // ── 4) Maj session ───────────────────────────────────────────
    if (session_id) {
      const sessResult = await dbRun(
        supabase.from('sessions_table').select('total').eq('id', session_id).single()
      );
      if (sessResult.data) {
        await dbRun(
          supabase.from('sessions_table')
            .update({ total: parseFloat(sessResult.data.total || 0) + total })
            .eq('id', session_id)
        );
      }
    }

    // ── 5) Cumul du total de table + auto-close ───────────────
    let tableClosed = false;
    try {
      const tablesRouter = require('./tables');
      // a) Cumuler le total dans la session de table (visible avant clôture)
      if (table_id && tablesRouter && typeof tablesRouter.bumpSessionTotal === 'function') {
        tablesRouter.bumpSessionTotal(table_id, total);
      }
      // b) Auto-close configurable via settings.pos.autoCloseTable (défaut: true)
      const storage  = require('../storage');
      const settings = storage.read('settings', {});
      const autoClose = (settings.pos && settings.pos.autoCloseTable !== false);
      if (autoClose && table_id && tablesRouter && typeof tablesRouter.closeTableProgrammatic === 'function') {
        tableClosed = tablesRouter.closeTableProgrammatic(table_id);
      }
    } catch (e) { /* silencieux : ne JAMAIS faire échouer une vente */ }

    // ── 6) Attribution serveur (JSON local) ──────────────────
    //     Pour l'analyse Performance par serveur dans le dashboard.
    //     Pas de modif schéma Supabase nécessaire.
    try {
      const storage = require('../storage');
      const attr    = storage.read('commandes_attribution', []) || [];
      // Préfère le nom d'affichage, sinon username
      const serveur = (req.user && (req.user.nom || req.user.username)) || 'inconnu';
      const nbItems = items.reduce((s, i) => s + (parseInt(i.quantite) || 0), 0);
      attr.push({
        commande_id: commande.id,
        serveur:     serveur,
        total:       total,
        nb_items:    nbItems,
        table_id:    safeTableId,
        created_at:  commande.created_at || new Date().toISOString(),
      });
      // Garder seulement les 5000 dernières (anti-bloat)
      if (attr.length > 5000) attr.splice(0, attr.length - 5000);
      storage.write('commandes_attribution', attr);
    } catch (e) { /* silencieux : ne JAMAIS faire échouer une vente */ }

    console.log(`[ORDER] OK Commande #${commande.id} — ${total.toFixed(3)} DT${ruptures.length ? ` (${ruptures.length} rupture(s))` : ''}${tableClosed ? ' (table libérée)' : ''}`);
    return res.status(201).json({
      success:      true,
      commande_id:  commande.id,
      total,
      table_closed: tableClosed,
      warnings:     ruptures.map(r => `Produit en rupture : ${r.nom}`),
      ruptures,
    });
  } catch (err) {
    console.error('[ORDER] Erreur globale:', err.message || err);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

module.exports = router;
