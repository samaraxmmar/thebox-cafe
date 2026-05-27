'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Middlewares production-ready
   - Request timeout configurable
   - Rate limit générique (token bucket simple, in-memory)
   - Security headers minimaux (sans dépendance externe)
   ────────────────────────────────────────────────────────────────────── */

const crypto = require('crypto');

/**
 * Timeout dur sur chaque requête. Si dépassé → 504.
 * Skip pour les routes streamées (rapport PDF).
 */
function requestTimeout(ms = 25000, skipRegex = /^\/api\/rapport/) {
  return function(req, res, next) {
    if (skipRegex && skipRegex.test(req.path)) return next();
    const t = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Request timeout' });
      }
    }, ms);
    t.unref();
    res.on('finish', () => clearTimeout(t));
    res.on('close',  () => clearTimeout(t));
    next();
  };
}

/**
 * Rate limit léger : N requêtes / window par IP+path.
 * Pour login on conseille { max: 10, windowMs: 60_000 }.
 */
function rateLimit({ max = 60, windowMs = 60_000, keyFn } = {}) {
  const hits = new Map(); // key → [timestamps]
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const fresh = arr.filter(t => now - t < windowMs);
      if (!fresh.length) hits.delete(k);
      else if (fresh.length !== arr.length) hits.set(k, fresh);
    }
  }, windowMs).unref();

  return function(req, res, next) {
    const k = keyFn ? keyFn(req) : (req.ip || 'x') + ':' + req.path;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Trop de requêtes — réessaie plus tard' });
    }
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}

/**
 * Security headers minimaux. Pas de dépendance externe (pas helmet).
 */
function securityHeaders() {
  return function(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0'); // déprécié mais explicit-off est mieux
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Pas de CSP strict pour ne pas casser Chart.js CDN.
    next();
  };
}

/**
 * Génère un request-id court pour tracer les requêtes dans les logs.
 */
function requestId() {
  return function(req, res, next) {
    req.id = (req.headers['x-request-id'] || crypto.randomBytes(4).toString('hex'));
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

module.exports = { requestTimeout, rateLimit, securityHeaders, requestId };
