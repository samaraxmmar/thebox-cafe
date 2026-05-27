'use strict';

/* Helpers de validation/sanitization — sans dépendance.
   Conçus pour les routes POST/PATCH. */

const MAX_STR = 200;
const MAX_URL = 500;

function str(v, max = MAX_STR) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** Numérique strict, borné. NaN → null. */
function num(v, { min = -1e12, max = 1e12 } = {}) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Integer positif strict. */
function intPos(v, { max = 2_000_000_000 } = {}) {
  const n = num(v, { min: 0, max });
  return n == null ? null : Math.floor(n);
}

/** URL HTTP(S) seulement. Refuse javascript:, data:, file:, etc. */
function safeUrl(v) {
  if (!v) return '';
  const s = String(v).trim().slice(0, MAX_URL);
  if (!/^https?:\/\//i.test(s)) return '';
  // Bloque les caractères de contrôle / espaces / chevrons
  if (/[\s<>"]/.test(s)) return '';
  return s;
}

/** Enum strict — renvoie default si valeur non listée. */
function oneOf(v, allowed, def = null) {
  return allowed.includes(v) ? v : def;
}

/** Nom de catégorie — lettres/chiffres/espaces/tirets/accents. */
function cleanName(v, max = 80) {
  if (!v) return '';
  return String(v).trim().slice(0, max).replace(/[^\p{L}\p{N}\s\-_'.&()]/gu, '');
}

module.exports = { str, num, intPos, safeUrl, oneOf, cleanName };
