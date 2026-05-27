'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Atomic JSON file store
   Sauvegardes atomiques (écrire dans .tmp puis rename → pas de corruption
   en cas de crash). Lectures avec fallback sur valeur par défaut.
   ────────────────────────────────────────────────────────────────────── */

const fs   = require('fs');
const path = require('path');

/* Détermine un dossier de données WRITABLE :
   1) THEBOX_DATA_DIR (défini par main.js Electron en prod)
   2) <projet>/data en dev
   En prod packaged, __dirname pointe DANS app.asar → non writable.
   On veut donc toujours sortir vers %APPDATA% côté Electron. */
function _resolveDataDir() {
  if (process.env.THEBOX_DATA_DIR) return process.env.THEBOX_DATA_DIR;
  const candidate = path.join(__dirname, '..', 'data');
  // Si on est manifestement à l'intérieur d'un app.asar, basculer vers HOME
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
    // Sauvegarder un .corrupt et repartir sur le fallback
    try {
      const bak = fp + '.corrupt.' + Date.now();
      fs.copyFileSync(fp, bak);
      console.warn(`[storage] backup → ${bak}`);
    } catch (_) {}
    return fallback;
  }
}

function write(name, data) {
  const fp  = filePath(name);
  const tmp = fp + '.tmp';
  const txt = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, txt, 'utf8');
  fs.renameSync(tmp, fp);
  return true;
}

/** Lit, applique mutator(data) et réécrit. mutator peut renvoyer une nouvelle valeur. */
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

module.exports = { read, write, update, filePath, DATA_DIR, listFiles };
