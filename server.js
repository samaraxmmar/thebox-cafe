'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Serveur principal
   ────────────────────────────────────────────────────────────────────── */

require('dotenv').config();

const express = require('express');
const path    = require('path');

let log;
try { log = require('./src/logger'); }
catch (_) { log = { info: console.log, warn: console.warn, error: console.error, debug: console.log }; }

const routes       = require('./src/api');
const { initWA }   = require('./src/whatsapp');
const { initCrons} = require('./src/crons');
const authMw       = require('./src/auth');
const logbuf       = require('./src/logbuffer');
const mw           = require('./src/middleware');

const app  = express();
app.set('trust proxy', true); // pour req.ip correct derrière nginx/cloudflare
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // par défaut localhost — sécurise

/* ── Bootstrap des fichiers JSON par défaut (users, settings...) ── */
try { authMw.bootstrap(); } catch (e) { log.error('Bootstrap auth: ' + e.message); }

/* ── Middleware ─────────────────────────────────────────────────── */
app.use(mw.securityHeaders());
app.use(mw.requestId());
app.use(mw.requestTimeout(25_000));
app.use(express.json({ limit: '8mb' })); // 8 Mo pour permettre upload base64 d'images
// En DEV : pas de cache HTTP pour les changements visibles instantanément
const isProd = process.env.NODE_ENV === 'production';
app.use(express.static(path.join(__dirname, 'public'), {
  etag: isProd,
  lastModified: isProd,
  maxAge: isProd ? '1d' : 0,
  setHeaders: function(res, filePath) {
    if (!isProd && /\.(html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// Servir les images uploadées (data/uploads/) sous /uploads
try {
  const storage = require('./src/storage');
  const uploadDir = require('path').join(storage.DATA_DIR, 'uploads');
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', etag: true }));
} catch (e) { log.warn('Upload dir non monté : ' + e.message); }

// Attache req.user si une session valide est présente (cookie)
app.use(authMw.attachUser);

// Mini-logger requête
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') && !req.path.endsWith('/status')) {
      log.debug(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - t0}ms)`);
    }
  });
  next();
});

app.use('/api', routes);

/* ── 404 API ─────────────────────────────────────────────────────── */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ── Gestion d'erreurs globale ───────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error({ err: err.message, stack: err.stack, path: req.path }, 'Express error');
  try { logbuf.add('error', err.message, { path: req.path }); } catch (_) {}
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

/* ── Process-level safety net ────────────────────────────────────── */
process.on('unhandledRejection', (reason) => {
  log.error({ reason: reason && reason.message ? reason.message : reason }, 'unhandledRejection');
  try { logbuf.add('error', 'unhandledRejection', { reason: reason && reason.message }); } catch (_) {}
});
process.on('uncaughtException', (err) => {
  log.error({ err: err.message, stack: err.stack }, 'uncaughtException');
  try { logbuf.add('error', 'uncaughtException', { err: err.message }); } catch (_) {}
});

/* ── Démarrage ──────────────────────────────────────────────────── */
const server = app.listen(PORT, HOST, async () => {
  log.info(`☕  THE BOX — http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') log.warn('Serveur exposé sur 0.0.0.0 — vérifier le firewall');
  logbuf.add('info', `Serveur démarré sur ${HOST}:${PORT}`);
  try { await initWA(); } catch (e) { log.warn(`WA init: ${e.message}`); }
  try { initCrons(); }    catch (e) { log.warn(`Crons init: ${e.message}`); }
});

function shutdown(signal) {
  log.info(`Reçu ${signal} — arrêt en cours...`);
  server.close(() => { log.info('HTTP fermé. Bye.'); process.exit(0); });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
