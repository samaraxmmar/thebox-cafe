'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Auth & sessions
   - Mot de passe / PIN hashé via bcryptjs (pur JS, pas de build natif).
   - Session signée HMAC-SHA256 dans un cookie HttpOnly.
   - Expiration : 12h (configurable via SESSION_TTL_HOURS).
   ────────────────────────────────────────────────────────────────────── */

const crypto = require('crypto');
const bcrypt = (() => {
  try { return require('bcryptjs'); }
  catch (e) {
    console.warn('[auth] bcryptjs absent — installe-le : npm i bcryptjs');
    // Fallback minimal — NE PAS UTILISER en production.
    return {
      hashSync: (p) => 'plain:' + p,
      compareSync: (p, h) => h === 'plain:' + p,
    };
  }
})();

const storage      = require('./storage');
const permissions  = require('./permissions');

const SESSION_TTL_MS = (parseInt(process.env.SESSION_TTL_HOURS) || 12) * 3600 * 1000;
const COOKIE_NAME    = 'thebox_sid';

function _secret() {
  // Récupéré depuis .env, ou auto-généré et persisté à la première utilisation.
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const s = storage.read('secrets', null);
  if (s && s.session) return s.session;
  const generated = crypto.randomBytes(48).toString('hex');
  storage.write('secrets', { session: generated });
  return generated;
}

function _sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', _secret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function _verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected    = crypto.createHmac('sha256', _secret()).update(body).digest('base64url');
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}

/* ── Mini-parser de cookies (pas de dépendance) ────────────────────── */
function _parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function _setCookie(res, name, value, maxAgeMs) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function _clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

/* ── User store ─────────────────────────────────────────────────────── */
// PINs par défaut surchargeables via .env (PIN_ADMIN, PIN_MANAGER, etc.)
// pour ne pas figer des secrets faibles en production.
function _defaultUsers() {
  const ts = new Date().toISOString();
  return [
    { id: 1, username: 'admin',  nom: 'Administrateur', role: 'admin',    pinHash: bcrypt.hashSync(process.env.PIN_ADMIN   || '1234', 10), actif: true, created_at: ts },
    { id: 2, username: 'manager',nom: 'Manager',        role: 'manager',  pinHash: bcrypt.hashSync(process.env.PIN_MANAGER || '2222', 10), actif: true, created_at: ts },
    { id: 3, username: 'caisse', nom: 'Caissier',       role: 'caissier', pinHash: bcrypt.hashSync(process.env.PIN_CAISSE  || '1111', 10), actif: true, created_at: ts },
    { id: 4, username: 'serveur',nom: 'Serveur',        role: 'serveur',  pinHash: bcrypt.hashSync(process.env.PIN_SERVEUR || '0000', 10), actif: true, created_at: ts },
  ];
}
const DEFAULT_USERS = _defaultUsers();

function bootstrap() {
  // Users
  let users = storage.read('users', null);
  if (!users || !Array.isArray(users) || users.length === 0) {
    storage.write('users', DEFAULT_USERS);
    users = DEFAULT_USERS;
    const usingEnvPins = !!(process.env.PIN_ADMIN || process.env.PIN_MANAGER);
    console.log('[auth] Comptes par défaut créés' + (usingEnvPins ? ' (PINs depuis .env)' : ' — ⚠ change les PINs par défaut via Utilisateurs avant la prod'));
  }
  // Permissions
  let perms = storage.read('permissions', null);
  if (!perms || typeof perms !== 'object') {
    storage.write('permissions', permissions.DEFAULTS);
  } else {
    // Patch : ajouter les nouvelles permissions si elles manquent
    // (rétro-compat pour les installations existantes)
    let patched = false;
    for (const role of Object.keys(permissions.DEFAULTS)) {
      if (!perms[role]) { perms[role] = permissions.DEFAULTS[role]; patched = true; continue; }
      for (const key of Object.keys(permissions.DEFAULTS[role])) {
        if (!(key in perms[role])) {
          perms[role][key] = permissions.DEFAULTS[role][key];
          patched = true;
        }
      }
    }
    if (patched) {
      storage.write('permissions', perms);
      console.log('[auth] permissions.json patché avec nouvelles clés');
    }
  }
  // Settings
  if (!storage.read('settings', null)) {
    storage.write('settings', {
      cafe: { nom: 'The Box', adresse: '', telephone: '', logo_url: '' },
      pos:  { devise: 'DT', langue: 'fr', tva: 0, service: 0, theme: 'light' },
      printer: { activeAuto: false, ip: '', port: 9100, name: 'Default' },
      whatsapp: { number: process.env.WHATSAPP_NUMBER || '', alertes_stock: true, rapport_quotidien: true, rapport_heure: '22:00' },
      supabase: { url: process.env.SUPABASE_URL || '', key_set: !!process.env.SUPABASE_KEY },
      security: { session_ttl_hours: 12, lockout_after_attempts: 5, min_pin_length: 4 },
    });
  }
}

function getUsers() { return storage.read('users', []); }
function saveUsers(users) { storage.write('users', users); }

function findUser(idOrUsername) {
  return getUsers().find(u =>
    u.id === idOrUsername || u.username === idOrUsername
  );
}

function nextUserId() {
  const u = getUsers();
  return u.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

/* ── Public API ─────────────────────────────────────────────────────── */

/** Login : { username, pin } → { user } ou { error } */
function login({ username, pin }) {
  if (!username || !pin) return { error: 'Identifiants requis' };
  const u = findUser(String(username).toLowerCase().trim());
  if (!u)               return { error: 'Utilisateur introuvable' };
  if (u.actif === false)return { error: 'Compte désactivé' };
  if (!bcrypt.compareSync(String(pin), u.pinHash)) return { error: 'Code PIN incorrect' };
  return { user: _sanitize(u) };
}

function _sanitize(u) {
  const { pinHash, ...rest } = u;
  return rest;
}

function hash(pin) { return bcrypt.hashSync(String(pin), 10); }

function permsForRole(role) {
  const all = storage.read('permissions', permissions.DEFAULTS);
  return all[role] || {};
}

function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true; // L'admin a toujours tout (override)
  const p = permsForRole(user.role);
  return !!p[key];
}

/* ── Middleware Express ─────────────────────────────────────────────── */
function attachUser(req, res, next) {
  const cookies = _parseCookies(req.headers.cookie);
  const tok = cookies[COOKIE_NAME];
  const payload = _verify(tok);
  if (payload) {
    const u = findUser(payload.uid);
    if (u && u.actif !== false) req.user = _sanitize(u);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
}

/** Fabrique un middleware qui vérifie une permission. */
function requirePerm(key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!hasPermission(req.user, key)) {
      return res.status(403).json({ error: 'Permission refusée', perm: key });
    }
    next();
  };
}

function issueSession(res, user) {
  const exp = Date.now() + SESSION_TTL_MS;
  const tok = _sign({ uid: user.id, role: user.role, exp });
  _setCookie(res, COOKIE_NAME, tok, SESSION_TTL_MS);
  return exp;
}

function destroySession(res) { _clearCookie(res, COOKIE_NAME); }

module.exports = {
  bootstrap,
  attachUser, requireAuth, requirePerm,
  login, issueSession, destroySession,
  hasPermission, permsForRole,
  getUsers, saveUsers, findUser, nextUserId, hash,
  _sanitize,
};
