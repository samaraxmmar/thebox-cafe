'use strict';

const express = require('express');
const router  = express.Router();
const storage = require('../storage');
const auth    = require('../auth');
const logs    = require('../logbuffer');
const path    = require('path');
const fs      = require('fs');

router.use(auth.requireAuth);

// GET /api/settings
router.get('/', auth.requirePerm('settings.view'), (req, res) => {
  const s = storage.read('settings', {});
  // ne jamais exposer de clés sensibles
  if (s.supabase) s.supabase = { url: s.supabase.url || '', key_set: !!s.supabase.key_set };
  res.json(s);
});

// PATCH /api/settings  body = partial { cafe?, pos?, printer?, whatsapp?, taxes?, security? }
router.patch('/', auth.requirePerm('settings.edit'), (req, res) => {
  const current = storage.read('settings', {});
  const body    = req.body || {};
  const merged  = { ...current };
  for (const k of Object.keys(body)) {
    if (typeof body[k] === 'object' && body[k] !== null && !Array.isArray(body[k])) {
      merged[k] = { ...(current[k] || {}), ...body[k] };
    } else {
      merged[k] = body[k];
    }
  }
  storage.write('settings', merged);
  logs.add('info', 'Paramètres mis à jour', { by: req.user.username, keys: Object.keys(body) });
  res.json(merged);
});

// GET /api/settings/backup — dump complet en JSON (à télécharger)
router.get('/backup', auth.requirePerm('settings.edit'), (req, res) => {
  const dump = {};
  for (const f of storage.listFiles()) {
    const name = f.replace(/\.json$/, '');
    if (name === 'secrets') continue; // jamais dans le backup
    dump[name] = storage.read(name, null);
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="thebox-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json({ version: 1, exported_at: new Date().toISOString(), data: dump });
  logs.add('info', 'Backup généré', { by: req.user.username });
});

// POST /api/settings/restore — restaurer depuis un backup JSON
router.post('/restore', auth.requirePerm('settings.edit'), (req, res) => {
  const body = req.body || {};
  if (!body.data || typeof body.data !== 'object') return res.status(400).json({ error: 'Backup invalide' });
  for (const name of Object.keys(body.data)) {
    if (name === 'secrets') continue;
    try { storage.write(name, body.data[name]); } catch (e) { console.warn('[restore]', name, e.message); }
  }
  logs.add('warn', 'Backup restauré', { by: req.user.username });
  res.json({ success: true });
});

module.exports = router;
