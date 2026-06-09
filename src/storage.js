'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Atomic JSON file store + Supabase sync
   - Lectures sync (cache local)
   - Écritures sync local + push async vers Supabase (fire-and-forget)
   - Au boot : pull initial depuis Supabase si configuré
   ────────────────────────────────────────────────────────────────────── */

const fs   = require('fs');
const path = require('path');

// Charger db lazy pour éviter circular imports
let _db = null;
function _getDb() {
  if (_db !== null) return _db;
  try { _db = require('./db'); }
  catch (_) { _db = false; }
  return _db || null;
}

let _supabaseSyncReady = false;

/* Dossier de données writable */
function _resolveDataDir() {
  if (process.env.THEBOX_DATA_DIR) return process.env.THEBOX_DATA_DIR;
  const candidate = path.join(__dirname, '..', 'data');
  if (/\\app\.asar(\\|$)/i.test(__dirname) || /\/app\.asar(\/|$)/.test(__dirname)) {
    return path.join(
      process.env.APPDATA || process.env.HOME || process.cwd(),
      'TheBox', 'data'
    );
  }
  return candidate;
}

const DATA_DIR = _resolveDataDir();

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('[storage] mkdir échec:', DATA_DIR, e.message);
    throw e;
  }
}

function filePath(name) {
  ensureDir();
  return path.join(DATA_DIR, name + '.json');
}

function read(name, fallback = null) {
  const fp = filePath(name);
  try {
    if (!fs.existsSync(fp)) return fallback;
    const raw = fs.readFileSync(fp, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] read ${name} corrompu — fallback`, err.message);
    try {
      const bak = fp + '.corrupt.' + Date.now();
      fs.copyFileSync(fp, bak);
      console.warn(`[storage] backup → ${bak}`);
    } catch (_) {}
    return fallback;
  }
}

/**
 * Écrit la valeur en local (sync) ET push vers Supabase (async fire-and-forget).
 * @param {string} name - clé
 * @param {*} data - valeur à stocker
 * @param {object} [opts] - { skipSync: true } pour ne pas push vers Supabase (utilisé par le pull)
 */
function write(name, data, opts) {
  const fp  = filePath(name);
  const tmp = fp + '.tmp';
  const txt = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, txt, 'utf8');
  fs.renameSync(tmp, fp);
  if (!opts || !opts.skipSync) _pushToSupabase(name, data);
  return true;
}

/** Lit, applique mutator(data) et réécrit. */
function update(name, mutator, fallback = {}) {
  const cur = read(name, fallback);
  const next = mutator(cur) ?? cur;
  write(name, next);
  return next;
}

function listFiles() {
  ensureDir();
  return fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
}

/* ── Synchronisation avec Supabase (table app_data) ──────────────────── */

/**
 * À appeler une fois au boot, AVANT que l'app ne reçoive des requêtes.
 * Tire la dernière version de chaque clé depuis Supabase et l'écrit en local.
 * Si Supabase n'est pas configuré OU si la table app_data n'existe pas,
 * fail silencieusement et l'app fonctionne en local-only.
 */
async function initSupabaseSync() {
  const db = _getDb();
  if (!db || !db.CONFIGURED) {
    console.log('[storage] Supabase non configuré → mode local-only');
    return;
  }
  try {
    const { data, error } = await db.from('app_data').select('key, value, updated_at');
    if (error) {
      // Table inexistante ou autre problème → mode local-only
      console.warn('[storage] Sync Supabase indisponible :', (error.message || error).slice(0, 100));
      console.warn('[storage] → mode local-only (créer la table app_data via migrations/01_app_data.sql pour activer le sync)');
      return;
    }
    if (Array.isArray(data) && data.length > 0) {
      let pulled = 0;
      data.forEach(row => {
        if (row && row.key && row.value !== undefined) {
          try {
            write(row.key, row.value, { skipSync: true });
            pulled++;
          } catch (e) {
            console.warn('[storage] pull ' + row.key + ' échec :', e.message);
          }
        }
      });
      console.log('[storage] Sync Supabase ACTIF — ' + pulled + ' clé(s) chargée(s) depuis Supabase');
    } else {
      console.log('[storage] Sync Supabase ACTIF — table app_data vide');
      // Push initial UNIQUEMENT si la variable d'env l'autorise explicitement
      // (à set sur ton PC local au 1er sync, JAMAIS sur Railway)
      if (process.env.THEBOX_INITIAL_PUSH === 'true') {
        console.log('[storage] THEBOX_INITIAL_PUSH=true → push initial du local vers Supabase');
        await _pushAllLocalToSupabase();
      } else {
        console.log('[storage] Tip: set THEBOX_INITIAL_PUSH=true en local pour pousser tes données vers Supabase');
      }
    }
    _supabaseSyncReady = true;
  } catch (e) {
    console.warn('[storage] initSupabaseSync exception :', e.message);
  }
}

/** Push toutes les clés locales vers Supabase (utile au 1er boot pour migrer). */
async function _pushAllLocalToSupabase() {
  const db = _getDb();
  if (!db || !db.CONFIGURED) return;
  const files = listFiles();
  let pushed = 0;
  for (const f of files) {
    const key = f.replace(/\.json$/i, '');
    // Skip les fichiers de secrets locaux (session secret)
    if (key === 'secrets') continue;
    const val = read(key, null);
    if (val === null) continue;
    try {
      const { error } = await db.from('app_data')
        .upsert({ key, value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) console.warn('[storage] push initial ' + key + ' :', error.message);
      else pushed++;
    } catch (e) {
      console.warn('[storage] push initial ' + key + ' exception :', e.message);
    }
  }
  if (pushed) console.log('[storage] Push initial OK — ' + pushed + ' clé(s) envoyée(s) à Supabase');
}

/**
 * Push une clé vers Supabase, fire-and-forget. Ne bloque jamais l'appelant.
 */
function _pushToSupabase(name, value) {
  if (!_supabaseSyncReady) return;
  // Skip les secrets locaux (session signing key)
  if (name === 'secrets') return;
  const db = _getDb();
  if (!db || !db.CONFIGURED) return;
  // Fire and forget
  db.from('app_data')
    .upsert({ key: name, value: value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .then(({ error }) => {
      if (error) console.warn('[storage] push ' + name + ' KO :', error.message);
    })
    .catch(e => console.warn('[storage] push ' + name + ' exception :', e.message));
}

module.exports = {
  read,
  write,
  update,
  filePath,
  DATA_DIR,
  listFiles,
  initSupabaseSync,
};
