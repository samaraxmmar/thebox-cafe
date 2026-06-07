'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Permissions & rôles
   Catalogue centralisé des permissions + matrices par rôle.
   ────────────────────────────────────────────────────────────────────── */

// Catalogue : clé → libellé FR (utilisé par l'UI admin)
const CATALOG = {
  'dashboard.view':     'Voir le dashboard',
  'orders.create':      'Créer une commande',
  'orders.edit':        'Modifier une commande en cours',
  'orders.cancel':      'Annuler une commande',
  'orders.delete':      'Supprimer une commande / une journée entière',
  'orders.history':     'Voir l\'historique des commandes',
  'tables.view':        'Voir les tables',
  'tables.manage':      'Gérer les tables (ouvrir/clôturer/transférer)',
  'tables.admin':       'Créer/supprimer/réinitialiser les tables',
  'orders.decrement':   'Retirer une quantité d\'une commande (bouton −)',
  'stock.view':         'Voir le stock',
  'stock.edit':         'Modifier le stock (entrée/sortie/réappro)',
  'stock.movements':    'Voir l\'historique des mouvements',
  'products.view':      'Voir les produits',
  'products.edit':      'Créer / modifier / supprimer des produits',
  'stats.view':         'Voir les statistiques',
  'stats.export':       'Exporter (CSV / PDF)',
  'reports.z':          'Voir / éditer le Z de caisse',
  'users.manage':       'Gérer les utilisateurs et permissions',
  'settings.view':      'Voir les paramètres',
  'settings.edit':      'Modifier les paramètres système',
  'receipt.print':      'Imprimer / réimprimer un ticket',
  'cash.close':         'Clôturer la caisse',
  'logs.view':          'Voir les logs système',
};

// Matrices par défaut — modifiables via /api/permissions
const DEFAULTS = {
  admin: Object.keys(CATALOG).reduce((acc, k) => { acc[k] = true; return acc; }, {}),

  manager: {
    'dashboard.view':  true,
    'orders.create':   true,
    'orders.edit':     true,
    'orders.cancel':   true,
    'orders.delete':   false,           // manager peut annuler, pas supprimer définitivement
    'orders.history':  true,
    'orders.decrement':true,
    'tables.view':     true,
    'tables.manage':   true,
    'tables.admin':    true,
    'stock.view':      true,
    'stock.edit':      true,
    'stock.movements': true,
    'products.view':   true,
    'products.edit':   true,
    'stats.view':      true,
    'stats.export':    true,
    'reports.z':       true,
    'users.manage':    false,
    'settings.view':   true,
    'settings.edit':   false,
    'receipt.print':   true,
    'cash.close':      true,
    'logs.view':       false,
  },

  caissier: {
    'dashboard.view':  true,
    'orders.create':   true,
    'orders.edit':     true,
    'orders.cancel':   false,
    'orders.delete':   false,
    'orders.history':  true,
    'orders.decrement':true,
    'tables.view':     true,
    'tables.manage':   true,
    'tables.admin':    false,
    'stock.view':      true,
    'stock.edit':      false,
    'stock.movements': false,
    'products.view':   true,
    'products.edit':   false,
    'stats.view':      false,
    'stats.export':    false,
    'reports.z':       false,
    'users.manage':    false,
    'settings.view':   false,
    'settings.edit':   false,
    'receipt.print':   true,
    'cash.close':      false,
    'logs.view':       false,
  },

  serveur: {
    'dashboard.view':  false,
    'orders.create':   true,
    'orders.edit':     true,
    'orders.cancel':   false,
    'orders.delete':   false,
    'orders.history':  false,
    'orders.decrement':false,
    'tables.view':     true,
    'tables.manage':   true,
    'tables.admin':    false,
    'stock.view':      false,
    'stock.edit':      false,
    'stock.movements': false,
    'products.view':   true,
    'products.edit':   false,
    'stats.view':      false,
    'stats.export':    false,
    'reports.z':       false,
    'users.manage':    false,
    'settings.view':   false,
    'settings.edit':   false,
    'receipt.print':   true,
    'cash.close':      false,
    'logs.view':       false,
  },
};

const ROLE_LABELS = {
  admin:    'Administrateur',
  manager:  'Manager',
  caissier: 'Caissier',
  serveur:  'Serveur',
};

module.exports = { CATALOG, DEFAULTS, ROLE_LABELS };
