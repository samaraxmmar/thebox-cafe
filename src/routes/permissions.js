'use strict';

const express     = require('express');
const router      = express.Router();
const storage     = require('../storage');
const auth        = require('../auth');
const permissions = require('../permissions');
const logs        = require('../logbuffer');

router.use(auth.requireAuth);

// GET /api/permissions — catalogue + matrices
router.get('/', auth.requirePerm('users.manage'), (req, res) => {
  const matrix = storage.read('permissions', permissions.DEFAULTS);
  res.json({
    catalog: permissions.CATALOG,
    roles:   permissions.ROLE_LABELS,
    matrix,
  });
});

// PATCH /api/permissions  body = { role: { permKey: bool, ... } }
router.patch('/', auth.requirePerm('users.manage'), (req, res) => {
  const body = req.body || {};
  const matrix = storage.read('permissions', permissions.DEFAULTS);

  for (const role of Object.keys(body)) {
    if (!permissions.ROLE_LABELS[role]) continue;
    if (role === 'admin') continue;          // admin = toujours tout
    matrix[role] = matrix[role] || {};
    for (const k of Object.keys(body[role] || {})) {
      if (!Object.prototype.hasOwnProperty.call(permissions.CATALOG, k)) continue;
      matrix[role][k] = !!body[role][k];
    }
  }
  storage.write('permissions', matrix);
  logs.add('info', 'Permissions modifiées', { by: req.user.username });
  res.json({ success: true, matrix });
});

// POST /api/permissions/reset — restaurer les défauts
router.post('/reset', auth.requirePerm('users.manage'), (req, res) => {
  storage.write('permissions', permissions.DEFAULTS);
  logs.add('warn', 'Permissions réinitialisées', { by: req.user.username });
  res.json({ success: true, matrix: permissions.DEFAULTS });
});

module.exports = router;
