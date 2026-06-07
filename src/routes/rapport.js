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
    // Palette pro
    const GREEN = '#195334';     // primary brand
    const GREEN_LIGHT = '#ecf6ef';
    const TEXT  = '#0c0a09';
    const MUTED = '#78716c';
    const BORDER = '#e7e5e4';
    const SURFACE = '#fafaf9';

    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // ─── HEADER : barre verte fine + titre ──
    doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
    doc.fontSize(28).font('Helvetica-Bold').fillColor(TEXT)
       .text('THE BOX CAFÉ', 50, 30);
    doc.fontSize(10).font('Helvetica').fillColor(MUTED)
       .text('Système de caisse & gestion', 50, 62);
    // Date en haut-droite
    doc.fontSize(10).font('Helvetica-Bold').fillColor(GREEN)
       .text('RAPPORT JOURNALIER', 50, 30, { align: 'right', width: W });
    doc.fontSize(11).font('Helvetica').fillColor(TEXT)
       .text(dateLabel, 50, 48, { align: 'right', width: W });
    doc.moveTo(50, 88).lineTo(545, 88).strokeColor(BORDER).stroke();
    doc.y = 110;

    // ─── KPI CARDS (4 mini stats en grille) ──
    const kpis = [
      { lbl: "Chiffre d'affaires", val: `${totalCA.toFixed(3)} DT`, color: GREEN },
      { lbl: 'Commandes',          val: String(nbCmds),              color: '#2563eb' },
      { lbl: 'Ticket moyen',       val: nbCmds > 0 ? `${(totalCA/nbCmds).toFixed(3)} DT` : '—', color: '#a855f7' },
      { lbl: 'Alertes stock',      val: bas.length === 0 ? 'Aucune' : `${bas.length}`, color: bas.length > 0 ? '#dc2626' : '#16a34a' },
    ];
    const cardW = (W - 30) / 4;
    let cardX = 50;
    kpis.forEach(k => {
      const cardY = doc.y;
      // Card bg + thin border top colored
      doc.roundedRect(cardX, cardY, cardW, 70, 8).fillAndStroke('#ffffff', BORDER);
      doc.rect(cardX, cardY, cardW, 3).fill(k.color);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED)
         .text(k.lbl.toUpperCase(), cardX + 12, cardY + 14, { width: cardW - 24, characterSpacing: 0.5 });
      doc.fontSize(18).font('Helvetica-Bold').fillColor(TEXT)
         .text(k.val, cardX + 12, cardY + 32, { width: cardW - 24 });
      cardX += cardW + 10;
    });
    doc.y += 90;

    // ─── VENTES PAR PRODUIT (tableau pro) ──
    if (produits.length > 0) {
      // Titre section
      doc.fontSize(13).font('Helvetica-Bold').fillColor(TEXT).text('Ventes par produit', 50, doc.y);
      doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(`${produits.length} produit${produits.length > 1 ? 's' : ''} vendu${produits.length > 1 ? 's' : ''} aujourd'hui`, 50, doc.y);
      doc.moveDown(0.8);

      // Header row
      const colX = [55, 90, 360, 450];
      const headY = doc.y;
      doc.rect(50, headY, W, 22).fill(SURFACE);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('#', colX[0], headY + 7, { width: 30 });
      doc.text('PRODUIT',   colX[1], headY + 7, { width: 250 });
      doc.text('QUANTITÉ',  colX[2], headY + 7, { width: 80 });
      doc.text('REVENU',    colX[3], headY + 7, { width: 100, align: 'right' });
      doc.y = headY + 22;

      // Rows
      doc.font('Helvetica').fontSize(10).fillColor(TEXT);
      produits.slice(0, 30).forEach((p, idx) => {
        if (doc.y > doc.page.height - 100) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
          doc.y = 50;
        }
        const y = doc.y;
        // Alternate row bg
        if (idx % 2 === 0) doc.rect(50, y - 2, W, 20).fill(SURFACE);
        doc.fillColor(MUTED).text(String(idx + 1), colX[0], y + 4, { width: 30 });
        doc.fillColor(TEXT).font('Helvetica-Bold').text(p.nom, colX[1], y + 4, { width: 250, ellipsis: true });
        doc.font('Helvetica').fillColor(TEXT).text(String(p.qty), colX[2], y + 4, { width: 80 });
        doc.fillColor(GREEN).font('Helvetica-Bold').text(parseFloat(p.revenu).toFixed(3) + ' DT', colX[3], y + 4, { width: 100, align: 'right' });
        doc.font('Helvetica');
        doc.y = y + 20;
      });
      // Footer total ligne
      const totalRowY = doc.y + 5;
      doc.rect(50, totalRowY, W, 24).fill(GREEN_LIGHT);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(GREEN)
         .text('TOTAL', colX[1], totalRowY + 8, { width: 250 });
      doc.text(String(produits.reduce((s,p)=>s+p.qty, 0)), colX[2], totalRowY + 8, { width: 80 });
      doc.fillColor(GREEN).text(produits.reduce((s,p)=>s+parseFloat(p.revenu), 0).toFixed(3) + ' DT', colX[3], totalRowY + 8, { width: 100, align: 'right' });
      doc.y = totalRowY + 32;
    }

    // ─── ALERTES STOCK ──
    if (bas.length > 0) {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.moveDown(1);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#dc2626').text('⚠ Alertes stock', 50, doc.y);
      doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(`${bas.length} ingrédient${bas.length > 1 ? 's' : ''} sous le seuil minimum`, 50, doc.y);
      doc.moveDown(0.6);
      bas.forEach(i => {
        const y = doc.y;
        doc.rect(50, y - 2, W, 22).fill('#fef2f2');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('●', 60, y + 4);
        doc.fillColor(TEXT).font('Helvetica-Bold').text(i.nom, 80, y + 4, { width: 250 });
        doc.fillColor(MUTED).font('Helvetica').text(`${i.stock_actuel}${i.unite} / seuil ${i.seuil_minimum}${i.unite}`, 300, y + 4, { width: 240, align: 'right' });
        doc.y = y + 22;
        doc.moveDown(0.15);
      });
    }

    // ─── PAGE 2+ : DÉTAIL COMMANDES ──
    if (cmds.length > 0) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
      doc.fontSize(20).font('Helvetica-Bold').fillColor(TEXT).text('Détail des commandes', 50, 30);
      doc.fontSize(10).font('Helvetica').fillColor(MUTED).text(`${nbCmds} commande${nbCmds > 1 ? 's' : ''} · Total ${totalCA.toFixed(3)} DT · ${dateLabel}`, 50, 56);
      doc.moveTo(50, 80).lineTo(545, 80).strokeColor(BORDER).stroke();
      doc.y = 100;

      for (const c of cmds) {
        if (doc.y > doc.page.height - 120) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 6).fill(GREEN);
          doc.y = 40;
        }
        const heure = new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const yCmd = doc.y;
        // Card commande
        const cmdHeight = 26 + ((c.commande_items || []).length * 14) + 10;
        doc.roundedRect(50, yCmd, W, cmdHeight, 6).fillAndStroke('#ffffff', BORDER);
        // Header card
        doc.fontSize(11).font('Helvetica-Bold').fillColor(GREEN).text(`Commande #${c.id}`, 60, yCmd + 8);
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(heure, 60, yCmd + 8, { align: 'right', width: 100 });
        doc.fontSize(12).font('Helvetica-Bold').fillColor(TEXT).text(`${parseFloat(c.total).toFixed(3)} DT`, 50, yCmd + 8, { align: 'right', width: W - 20 });
        // Items
        doc.y = yCmd + 26;
        doc.font('Helvetica').fontSize(9).fillColor(MUTED);
        for (const item of (c.commande_items || [])) {
          doc.text(`${item.quantite}× ${item.produits?.nom || '?'}`, 70, doc.y, { width: 300, continued: true });
          doc.fillColor(TEXT).text(`${(item.quantite * parseFloat(item.prix_unitaire)).toFixed(3)} DT`, { align: 'right' });
          doc.fillColor(MUTED);
          doc.moveDown(0.05);
        }
        doc.y = yCmd + cmdHeight + 8;
      }
    }

    // ─── FOOTER (toutes pages) ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).font('Helvetica').fillColor(MUTED)
         .text(`The Box Café · Rapport du ${dateLabel} · Page ${i + 1} sur ${range.count}`,
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
