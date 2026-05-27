'use strict';

/* Mini buffer circulaire de logs en mémoire (consulté par /api/logs).
   Persisté périodiquement sur disque (data/logs.json).            */

const storage = require('./storage');

const MAX = 500;
let buf = [];

// Hydrate au démarrage
try { buf = storage.read('logs', []) || []; if (!Array.isArray(buf)) buf = []; } catch (_) { buf = []; }

let dirty = false;
function _flush() { if (dirty) { try { storage.write('logs', buf); } catch (_) {} dirty = false; } }
setInterval(_flush, 5000).unref();

function add(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level: String(level || 'info').toLowerCase(),
    message: String(message || ''),
    meta: meta || null,
  };
  buf.push(entry);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  dirty = true;
}

function list({ limit = 200, level } = {}) {
  let out = buf;
  if (level) out = out.filter(e => e.level === level);
  return out.slice(-Math.min(limit, MAX)).reverse();
}

function clear() { buf = []; dirty = true; _flush(); }

module.exports = { add, list, clear };
