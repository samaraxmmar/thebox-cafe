'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Familles de catégories (hiérarchie 2 niveaux)
   Stockage local data/families.json :
   {
     families: ['Boisson Chaude', 'Boisson Froide', 'Cake'],
     mapping:  { 'COFFEE': 'Boisson Chaude', 'SMOOTHIES': 'Boisson Froide', ... }
   }
   Permet de regrouper les catégories (plates en BD) en grandes familles.
   ────────────────────────────────────────────────────────────────────── */

const storage = require('./storage');
const FILE = 'families';

const DEFAULT_FAMILIES = ['Boisson Chaude', 'Boisson Froide', 'Cake'];

// Auto-classification heuristique à l'initialisation
const DEFAULT_MAPPING = {
  // ── Boissons chaudes ──
  'COFFEE':         'Boisson Chaude',
  'CAFE':           'Boisson Chaude',
  'CAFÉ':           'Boisson Chaude',
  'CAFE LATTE':     'Boisson Chaude',
  'CAFE LATE':      'Boisson Chaude',
  'LATTE':          'Boisson Chaude',
  'HOT CHOCLATE':   'Boisson Chaude',
  'HOT CHOCOLATE':  'Boisson Chaude',
  'CHOCOLAT':       'Boisson Chaude',
  'TEA':            'Boisson Chaude',
  'TEAS':           'Boisson Chaude',
  'THE':            'Boisson Chaude',
  'THÉ':            'Boisson Chaude',
  'Boisson chaude': 'Boisson Chaude',

  // ── Boissons froides ──
  'FRAPPE':         'Boisson Froide',
  'FRAPPUCCINO':    'Boisson Froide',
  'FRAPPUCINO':     'Boisson Froide',
  'SODA':           'Boisson Froide',
  'MOJITOS':        'Boisson Froide',
  'MOJITO':         'Boisson Froide',
  'SMOOTHIES':      'Boisson Froide',
  'SMOOTHIE':       'Boisson Froide',
  'FRESH JUICE':    'Boisson Froide',
  'JUS':            'Boisson Froide',
  'MILKSHAKES':     'Boisson Froide',
  'MILKKSHAKES':    'Boisson Froide',
  'MILKSHAKE':      'Boisson Froide',
  'DUOS':           'Boisson Froide',
  'ICE COFFEE':     'Boisson Froide',
  'EAU':            'Boisson Froide',
  'Boisson froide': 'Boisson Froide',

  // ── Cake / Pâtisserie / Snack ──
  'Cake':           'Cake',
  'CAKE':           'Cake',
  'GAUFRE':         'Cake',
  'GAUFRRE':        'Cake',
  'CREPE':          'Cake',
  'CRÊPE':          'Cake',
  'CREP':           'Cake',
  'PAIN':           'Cake',
  'PAIN CAKE':      'Cake',
  'PATISSERIE':     'Cake',
  'PÂTISSERIE':     'Cake',
  'Snack':          'Cake',
  'SNACK':          'Cake',
};

function _load() {
  let d = storage.read(FILE, null);
  if (!d || typeof d !== 'object') {
    d = { families: DEFAULT_FAMILIES.slice(), mapping: Object.assign({}, DEFAULT_MAPPING) };
    storage.write(FILE, d);
  }
  if (!Array.isArray(d.families)) d.families = DEFAULT_FAMILIES.slice();
  if (!d.mapping || typeof d.mapping !== 'object') d.mapping = {};
  return d;
}
function _save(d) { storage.write(FILE, d); }

/** Retourne { families: [...], mapping: {cat: family} } */
function getAll() { return _load(); }

/** Retourne la famille d'une catégorie (ou null si non assignée) */
function familyOf(category) {
  if (!category) return null;
  const d = _load();
  // Case-insensitive match
  const key = String(category).trim();
  if (d.mapping[key]) return d.mapping[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(d.mapping)) {
    if (k.toLowerCase() === lower) return d.mapping[k];
  }
  return null;
}

function addFamily(name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return null;
  const d = _load();
  if (!d.families.includes(name)) d.families.push(name);
  _save(d);
  return d;
}

function renameFamily(from, to) {
  from = String(from || '').trim();
  to   = String(to   || '').trim().slice(0, 40);
  if (!from || !to || from === to) return _load();
  const d = _load();
  d.families = d.families.map(f => f === from ? to : f);
  for (const k of Object.keys(d.mapping)) {
    if (d.mapping[k] === from) d.mapping[k] = to;
  }
  _save(d);
  return d;
}

function deleteFamily(name) {
  name = String(name || '').trim();
  const d = _load();
  d.families = d.families.filter(f => f !== name);
  for (const k of Object.keys(d.mapping)) {
    if (d.mapping[k] === name) delete d.mapping[k];
  }
  _save(d);
  return d;
}

function assign(category, family) {
  category = String(category || '').trim();
  if (!category) return _load();
  const d = _load();
  if (!family) {
    delete d.mapping[category];
  } else {
    d.mapping[category] = String(family).trim().slice(0, 40);
    if (!d.families.includes(d.mapping[category])) d.families.push(d.mapping[category]);
  }
  _save(d);
  return d;
}

/** Renomme une catégorie : maj du mapping (la famille reste la même) */
function renameCategory(from, to) {
  from = String(from || '').trim();
  to   = String(to   || '').trim();
  if (!from || !to || from === to) return _load();
  const d = _load();
  if (d.mapping[from]) {
    d.mapping[to] = d.mapping[from];
    delete d.mapping[from];
    _save(d);
  }
  return d;
}

/** Retire une catégorie du mapping (utile quand on supprime la catégorie) */
function removeCategory(cat) {
  cat = String(cat || '').trim();
  const d = _load();
  if (d.mapping[cat]) {
    delete d.mapping[cat];
    _save(d);
  }
  return d;
}

module.exports = {
  getAll, familyOf,
  addFamily, renameFamily, deleteFamily,
  assign, renameCategory, removeCategory,
  DEFAULT_FAMILIES, DEFAULT_MAPPING,
};
