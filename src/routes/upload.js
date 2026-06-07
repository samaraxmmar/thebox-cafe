'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Upload d'images (photos de produits)
   Accepte un body base64 (data URL) → décode → sauvegarde dans
   data/uploads/<id>.<ext> → renvoie l'URL relative servie en statique.
   ────────────────────────────────────────────────────────────────────── */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const auth    = require('../auth');
const storage = require('../storage');

const UPLOAD_DIR = path.join(storage.DATA_DIR, 'uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}

// POST /api/upload  body: { data: "data:image/png;base64,...", ext: "png" }
router.post('/', auth.requireAuth, auth.requirePerm('products.edit'), (req, res) => {
  try {
    const body = req.body || {};
    const dataUrl = String(body.data || '');
    if (!dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'data:image/... attendu' });
    }
    const m = dataUrl.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: 'Format base64 invalide' });

    let ext = (m[1] || 'png').toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    if (!['png', 'jpg', 'webp', 'gif'].includes(ext)) ext = 'png';

    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image trop lourde (max 5 Mo)' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const filename = id + '.' + ext;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, buf);

    const url = '/uploads/' + filename;
    res.json({ success: true, url, size: buf.length });
  } catch (e) {
    console.error('[UPLOAD]', e.message);
    res.status(500).json({ error: e.message || 'Erreur upload' });
  }
});

// DELETE /api/upload/:filename — supprimer une image
router.delete('/:filename', auth.requireAuth, auth.requirePerm('products.edit'), (req, res) => {
  const f = req.params.filename.replace(/[^a-z0-9._-]/gi, '');
  const p = path.join(UPLOAD_DIR, f);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  res.json({ success: true });
});

module.exports = router;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
