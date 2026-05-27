'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Rapport PDF
   Génère un rapport journalier en PDF (PDFKit) — protégé contre :
   • ERR_STREAM_WRITE_AFTER_END      (writes après end / disconnect client)
   • supabase.upsert().catch is not a function  (thenable, pas Promise)
   ────────────────────────────────────────────────────────────────────── */

const express  = require('express');
const router   = express.Router();
const supabase = require('../db');
const auth     = require('../auth');

/* Wrap un thenable Supabase pour exposer un vrai .catch / .then sûr. */
function safeQuery(builder) {
  return Promise.resolve(builder).catch(err => ({ error: err, data: null }));
}

router.get('/', auth.requireAuth, auth.requirePerm('stats.export'), async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  let PDFDoc;
  try { PDFDoc = require('pdfkit'); }
  catch (e) { return res.status(500).json({ error: 'pdfkit non installé — npm install pdfkit' }); }

  // ── 1) Charger les données AVANT de toucher au stream ─────────────
  let cmds = [], bas = [];
  try {
    const _start = new Date(`${date}T00:00:00`).toISOString();
    const _end   = new Date(`${date}T23:59:59.999`).toISOString();

    const { data: commandes, error: e1 } = await safeQuery(
      supabase.from('commandes')
        .select(`id, total, statut, created_at, commande_items(quantite, prix_unitaire, produits(nom))`)
        .gte('created_at', _start)
        .lte('created_at', _end)
        .order('created_at', { ascending: false })
    );
    if (e1) throw e1;
    cmds = commandes || [];

    const { data: ings } = await safeQuery(
      supabase.from('ingredients').select('*')
    );
    bas = (ings || []).filter(i => parseFloat(i.stock_actuel) < parseFloat(i.seuil_minimum));
  } catch (err) {
    console.error('[RAPPORT] data load:', err.message || err);
    if (!res.headersSent) return res.status(500).json({ error: err.message || 'Erreur chargement données' });
    return;
  }

  const totalCA = cmds.reduce((s, c) => s + parseFloat(c.total || 0), 0);
  const nbCmds  = cmds.length;

  const prodMap = {};
  for (const c of cmds) {
    for (const i of (c.commande_items || [])) {
      const nom = i.produits?.nom || '?';
      if (!prodMap[nom]) prodMap[nom] = { nom, qty: 0, revenu: 0 };
      prodMap[nom].qty    += i.quantite;
      prodMap[nom].revenu += i.quantite * parseFloat(i.prix_unitaire || 0);
    }
  }
  const produits = Object.values(prodMap).sort((a, b) => b.qty - a.qty);

  // ── 2) Sauvegarder un résumé (NON-bloquant, JAMAIS .catch sur thenable)
  //     On utilise une IIFE async + try/catch pour blinder le code.
  (async () => {
    try {
      await supabase
        .from('rapports_journaliers')
        .upsert(
          {
            date_rapport:     date,
            nb_commandes:     nbCmds,
            chiffre_affaires: totalCA,
            top_produit:      produits[0]?.nom || null,
            nb_alertes:       bas.length,
          },
          { onConflict: 'date_rapport' }
        );
    } catch (e) {
      console.warn('[RAPPORT] upsert résumé ignoré:', e.message || e);
    }
  })();

  // ── 3) Streamer le PDF, blindé contre les écritures après end ─────
  let ended = false;
  let clientGone = false;
  const doc = new PDFDoc({ size: 'A4', margin: 50, bufferPages: true });

  doc.on('error', err => console.error('[RAPPORT] PDF error:', err.message));

  // Si le client ferme la connexion → on note + on stoppe proprement.
  req.on('close', () => {
    clientGone = true;
    if (!ended) {
      ended = true;
      try { doc.end(); } catch (_) {}
    }
  });
  res.on('error', err => {
    clientGone = true;
    ended = true;
    console.warn('[RAPPORT] response error:', err.code || err.message);
  });

  // Vérifier que le client n'a pas raccroché AVANT d'envoyer les headers
  if (clientGone || req.aborted) return;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="rapport-${date}.pdf"`);
  doc.pipe(res);

  // Helper : abandonner sans crash si client parti
  const _abort = () => { ended = true; try { doc.end(); } catch (_) {} };
  if (clientGone) return _abort();

  try {
    const W = doc.page.width - 100;
    const GOLD = '#d97706', GRAY = '#6b7280';

    // En-tête
    doc.rect(0, 0, doc.page.width, 70).fill('#111827');
    doc.fontSize(24).font('Helvetica-Bold').fillColor(GOLD)
       .text('THE BOX', 50, 18, { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#9ca3af')
       .text('Rapport journalier', 50, 46, { align: 'center' });
    doc.y = 90;

    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
       .text(dateLabel, { align: 'center' });
    doc.moveDown(1.5);

    // Résumé
    doc.fontSize(13).font('Helvetica-Bold').fillColor(GOLD).text('Résumé');
    doc.moveDown(0.3);
    const statsRows = [
      ["Chiffre d'affaires", `${totalCA.toFixed(3)} DT`],
      ['Commandes',          `${nbCmds}`],
      ['Produit phare',      produits[0]?.nom || '—'],
      ['Alertes stock',      bas.length === 0 ? 'Tout OK' : `${bas.length} ingrédient(s) bas`],
    ];
    doc.font('Helvetica').fontSize(12).fillColor('#111827');
    statsRows.forEach(([l, v]) => {
      doc.fillColor(GRAY).text(l + ' :', 60, doc.y, { continued: true, width: 220 });
      doc.fillColor('#111827').font('Helvetica-Bold').text(v);
      doc.font('Helvetica').moveDown(0.3);
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(1);

    // Ventes par produit
    if (produits.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').fillColor(GOLD).text('Ventes par produit');
      doc.moveDown(0.4);
      const colX = [55, 290, 380, 470];
      const y0 = doc.y;
      doc.rect(50, y0 - 3, W, 18).fill('#f3f4f6');
      doc.fontSize(10).font('Helvetica-Bold').fillColor(GRAY);
      ['Produit', 'Quantité', 'Revenu (DT)', ''].forEach((h, i) => doc.text(h, colX[i], y0, { width: 100 }));
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor('#111827');
      produits.forEach((p, idx) => {
        if (doc.y > doc.page.height - 100) doc.addPage();
        if (idx % 2 === 0) doc.rect(50, doc.y - 2, W, 17).fill('#f9fafb');
        const y = doc.y;
        doc.fillColor('#111827').text(p.nom, colX[0], y, { width: 230 });
        doc.text(String(p.qty), colX[1], y, { width: 80 });
        doc.text(parseFloat(p.revenu).toFixed(3), colX[2], y, { width: 80 });
        doc.moveDown(0.4);
      });
    }

    // Alertes
    if (bas.length > 0) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(1);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#dc2626').text('Alertes Stock');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor('#111827');
      bas.forEach(i => {
        doc.text(`• ${i.nom} : ${i.stock_actuel}${i.unite} (seuil: ${i.seuil_minimum}${i.unite})`);
        doc.moveDown(0.2);
      });
    }

    // Page 2 : détail
    if (cmds.length > 0) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 60).fill('#111827');
      doc.fontSize(18).font('Helvetica-Bold').fillColor(GOLD).text('THE BOX', 50, 14, { align: 'center' });
      doc.fontSize(11).font('Helvetica').fillColor('#9ca3af').text(`Détail — ${dateLabel}`, 50, 36, { align: 'center' });
      doc.y = 80; doc.moveDown(0.5);
      doc.fontSize(13).font('Helvetica-Bold').fillColor(GOLD)
         .text(`${nbCmds} commande${nbCmds > 1 ? 's' : ''} — Total : ${totalCA.toFixed(3)} DT`);
      doc.moveDown(0.6);
      for (const c of cmds) {
        if (doc.y > doc.page.height - 120) doc.addPage();
        const heure = new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const yCmd = doc.y;
        doc.rect(50, yCmd - 2, W, 20).fill('#1f2937');
        doc.fontSize(11).font('Helvetica-Bold').fillColor(GOLD)
           .text(`#${c.id}  ${heure}`, 55, yCmd, { continued: true, width: 200 });
        doc.fillColor('#ffffff').font('Helvetica')
           .text(`${parseFloat(c.total).toFixed(3)} DT`, { align: 'right', width: W - 60 });
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).fillColor(GRAY);
        for (const item of (c.commande_items || [])) {
          doc.text(`    ${item.quantite}× ${item.produits?.nom || '?'}   —   ${parseFloat(item.prix_unitaire).toFixed(3)} DT/u   =   ${(item.quantite * parseFloat(item.prix_unitaire)).toFixed(3)} DT`);
          doc.moveDown(0.2);
        }
        doc.moveDown(0.4);
      }
    }

    // Pied de page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
         .text(`The Box Café — Rapport du ${date} — Page ${i + 1}/${range.count}`,
               50, doc.page.height - 30, { align: 'center', width: W });
    }

    if (!ended) {
      ended = true;
      doc.end();
    }
  } catch (err) {
    console.error('[RAPPORT] render:', err.message);
    ended = true;
    try { doc.end(); } catch (_) {}
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
