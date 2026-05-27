'use strict';

const cron     = require('node-cron');
const supabase = require('./db');
const wa       = require('./whatsapp');

// ── Vérification stock toutes les 30 min ────────────────────────────────────
function cronVerifStock() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { data: bas } = await supabase.rpc('get_ingredients_bas');
      if (bas && bas.length > 0) {
        await wa.send(wa.msgAlerteStock(bas));
        console.log(`[CRON] ⚠️ ${bas.length} alerte(s) stock envoyée(s)`);
      } else {
        console.log('[CRON] ✅ Stock OK');
      }
    } catch (err) {
      console.error('[CRON] Erreur vérif stock:', err.message);
    }
  });
}

// ── Rapport journalier à 22h ─────────────────────────────────────────────────
function cronRapport() {
  cron.schedule('0 22 * * *', async () => {
    try {
      const { data: stats } = await supabase.rpc('stats_du_jour');
      const { data: bas }   = await supabase.rpc('get_ingredients_bas');
      await wa.send(wa.msgRapport({
        ca:         stats?.chiffre_affaires || 0,
        nb:         stats?.nb_commandes     || 0,
        topProduit: stats?.top_produit      || null,
        alertes:    bas || [],
      }));
      console.log('[CRON] 📊 Rapport journalier envoyé');
    } catch (err) {
      console.error('[CRON] Erreur rapport:', err.message);
    }
  });
}

// ── Bonjour à 8h ─────────────────────────────────────────────────────────────
function cronBonjour() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const { data: bas } = await supabase.rpc('get_ingredients_bas');
      await wa.send(wa.msgBonjour(bas || []));
      console.log('[CRON] ☀️ Message bonjour envoyé');
    } catch (err) {
      console.error('[CRON] Erreur bonjour:', err.message);
    }
  });
}

function initCrons() {
  cronVerifStock();
  cronRapport();
  cronBonjour();
  console.log('⏰  Crons actifs (stock 30min, rapport 22h, bonjour 8h)');
}

module.exports = { initCrons };
