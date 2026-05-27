'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../auth');
const logs    = require('../logbuffer');

router.use(auth.requireAuth, auth.requirePerm('logs.view'));

// GET /api/logs?limit=200&level=info|warn|error
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  res.json(logs.list({ limit, level: req.query.level }));
});

// DELETE /api/logs
router.delete('/', (req, res) => {
  logs.clear();
  logs.add('warn', 'Logs vidés', { by: req.user.username });
  res.json({ success: true });
});

module.exports = router;
