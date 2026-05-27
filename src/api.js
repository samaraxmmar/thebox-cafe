'use strict';

const express = require('express');
const router  = express.Router();
const mw      = require('./middleware');

// ── Rate limiters par domaine ───────────────────────────────────
// Orders : protège contre le spam de commandes (ex: bug client en boucle)
const ordersLimiter = mw.rateLimit({ max: 120, windowMs: 60_000 }); // 120 cmd/min/IP
// Stock : écritures sensibles (réappro, suppression)
const stockLimiter  = mw.rateLimit({ max: 60,  windowMs: 60_000 }); // 60 ops/min/IP

router.use('/auth',        require('./routes/auth'));
router.use('/users',       require('./routes/users'));
router.use('/permissions', require('./routes/permissions'));
router.use('/settings',    require('./routes/settings'));
router.use('/logs',        require('./routes/logs'));
router.use('/reports',     require('./routes/reports'));
router.use('/movements',   require('./routes/movements'));

router.use('/produits',    require('./routes/produits'));
router.use('/stock',       stockLimiter,  require('./routes/stock'));
router.use('/orders',      ordersLimiter, require('./routes/orders'));
router.use('/commandes',   require('./routes/commandes'));
router.use('/stats',       require('./routes/stats'));
router.use('/status',      require('./routes/status'));
router.use('/tables',      require('./routes/tables'));
router.use('/rapport',     require('./routes/rapport'));

module.exports = router;
