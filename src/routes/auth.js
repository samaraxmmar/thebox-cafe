'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../auth');
const logs    = require('../logbuffer');
const mw      = require('../middleware');

// Rate-limit global de la route login : 20 tentatives / minute / IP
const loginLimiter = mw.rateLimit({ max: 20, windowMs: 60_000 });

// ── Brute-force protection (in-memory, 5 tentatives / 5min / IP+user)
// Anti memory-leak : cap dur + cleanup périodique des entrées expirées
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPT_KEYS  = 10_000;

function _key(req, u) { return (req.ip || 'x') + ':' + (u || ''); }

function _record(req, u) {
  const k = _key(req, u);
  const now = Date.now();
  const arr = (attempts.get(k) || []).filter(t => now - t < ATTEMPT_WINDOW_MS);
  arr.push(now);
  attempts.set(k, arr);

  // Cap dur : si la Map grossit trop, on évince les plus anciennes
  if (attempts.size > MAX_ATTEMPT_KEYS) {
    const it = attempts.keys();
    for (let i = 0; i < 1000; i++) { const n = it.next(); if (n.done) break; attempts.delete(n.value); }
  }
  return arr.length;
}
function _ok(req, u) { attempts.delete(_key(req, u)); }
function _locked(req, u) {
  const arr = attempts.get(_key(req, u)) || [];
  return arr.length >= 5;
}

// Cleanup périodique des entrées expirées toutes les 10min — non-bloquant
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of attempts) {
    const fresh = arr.filter(t => now - t < ATTEMPT_WINDOW_MS);
    if (!fresh.length) attempts.delete(k);
    else if (fresh.length !== arr.length) attempts.set(k, fresh);
  }
}, 10 * 60 * 1000).unref();

// POST /api/auth/login  { username, pin }
router.post('/login', loginLimiter, (req, res) => {
  try {
    const { username = '', pin = '' } = req.body || {};

    if (_locked(req, username)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 5 minutes.' });
    }

    const r = auth.login({ username, pin });
    if (r.error) {
      _record(req, username);
      logs.add('warn', 'Login échec', { username });
      return res.status(401).json({ error: r.error });
    }
    _ok(req, username);
    const exp = auth.issueSession(res, r.user);
    logs.add('info', 'Login OK', { username, role: r.user.role });
    return res.json({ user: r.user, expires_at: exp });
  } catch (err) {
    console.error('[AUTH] /login erreur:', err && err.stack || err);
    // Convertir ENOTDIR / EACCES en message lisible
    let friendly = err && err.message ? err.message : 'Erreur serveur';
    if (err && err.code === 'ENOTDIR') friendly = 'Stockage inaccessible — redémarre l\'application';
    if (err && err.code === 'EACCES')  friendly = 'Permission refusée sur le dossier de données';
    if (err && err.code === 'EROFS')   friendly = 'Dossier de données en lecture seule';
    return res.status(500).json({ error: friendly });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  auth.destroySession(res);
  if (req.user) logs.add('info', 'Logout', { username: req.user.username });
  res.json({ success: true });
});

// GET /api/auth/me — session courante + permissions effectives
router.get('/me', auth.requireAuth, (req, res) => {
  const perms = req.user.role === 'admin'
    ? Object.fromEntries(Object.keys(require('../permissions').CATALOG).map(k => [k, true]))
    : auth.permsForRole(req.user.role);
  res.json({ user: req.user, permissions: perms });
});

// POST /api/auth/change-pin   { current, next }
router.post('/change-pin', auth.requireAuth, (req, res) => {
  const { current, next: nextPin } = req.body || {};
  if (!current || !nextPin) return res.status(400).json({ error: 'Champs requis' });
  if (String(nextPin).length < 4) return res.status(400).json({ error: 'PIN trop court (min 4)' });
  const users = auth.getUsers();
  const u = users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const bcrypt = require('bcryptjs');
  if (!bcrypt.compareSync(String(current), u.pinHash)) {
    return res.status(401).json({ error: 'PIN actuel incorrect' });
  }
  u.pinHash = auth.hash(nextPin);
  u.updated_at = new Date().toISOString();
  auth.saveUsers(users);
  logs.add('info', 'PIN changé', { username: u.username });
  res.json({ success: true });
});

module.exports = router;
