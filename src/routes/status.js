'use strict';

const express  = require('express');
const router   = express.Router();
const wa       = require('../whatsapp');
const db       = require('../db');

// GET /api/status
router.get('/', async (req, res) => {
  res.json({
    server:    true,
    whatsapp:  wa.isReady(),
    supabase:  !!db.CONFIGURED,
    migration: true,
    time:      new Date().toISOString(),
  });
});

// POST /api/status/test-wa — envoyer un message de test
router.post('/test-wa', async (req, res) => {
  const msg = req.body?.message || `🧪 Test The Box — ${new Date().toLocaleTimeString('fr-FR')}`;
  await wa.send(msg);
  res.json({ sent: wa.isReady() });
});

// Permet aux autres modules de forcer un re-check (après migration)
router.post('/recheck-migration', (req, res) => {
  _migrationOK = null;
  res.json({ success: true });
});

module.exports = router;
