'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Supabase client
   Si SUPABASE_URL/KEY manquent, on créé un client "stub" qui renvoie
   une erreur claire au lieu de planter le serveur.
   ────────────────────────────────────────────────────────────────────── */

const { createClient } = require('@supabase/supabase-js');

const URL = (process.env.SUPABASE_URL || '').trim();
// Préférer la service_role key (serveur uniquement, bypass RLS).
// Fallback sur la anon key si service_role absente.
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const ANON_KEY    = (process.env.SUPABASE_KEY || '').trim();
const KEY = SERVICE_KEY || ANON_KEY;
const USING_SERVICE = !!SERVICE_KEY;
const CONFIGURED = URL && KEY && /^https?:\/\//i.test(URL);

let supabase;

if (CONFIGURED) {
  // Options : pas de persistance de session (serveur stateless côté Supabase)
  supabase = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log(`[DB] Supabase OK (${USING_SERVICE ? 'service_role' : 'anon'} key)`);
  if (!USING_SERVICE) {
    console.warn('[DB] ⚠ Utilisation de la anon key. En prod, préfère SUPABASE_SERVICE_KEY + RLS deny-all.');
  }
} else {
  console.warn('[DB] Supabase NON configuré (SUPABASE_URL / SUPABASE_KEY).');
  console.warn('[DB] Toutes les requêtes BD renverront une erreur claire.');

  // Stub : reproduit la chaîne fluide de Supabase et renvoie toujours une erreur lisible
  const NOT_CONFIGURED = {
    message: 'Supabase non configuré — édite .env dans %APPDATA%\\TheBox\\ et relance l\'app',
    code: 'NOT_CONFIGURED',
  };
  const makeQuery = () => {
    const result = Promise.resolve({ data: null, error: NOT_CONFIGURED });
    const chain = new Proxy(result, {
      get(target, prop) {
        if (prop in target) return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
        // Toute autre méthode (.eq, .select, .order, etc.) renvoie le même chain
        return () => chain;
      },
    });
    return chain;
  };

  supabase = {
    from: () => ({
      select: () => makeQuery(), insert: () => makeQuery(),
      update: () => makeQuery(), delete: () => makeQuery(),
      upsert: () => makeQuery(), eq: () => makeQuery(),
    }),
    rpc:  () => makeQuery(),
    auth: { signIn: async () => ({ error: NOT_CONFIGURED }) },
  };
}

/* Wrappers utilitaires utilisés dans certaines routes */
function safeQuery(builder) {
  return Promise.resolve(builder).then(
    (r) => r,
    (err) => ({ data: null, error: err })
  );
}
function safeFire(builder) {
  Promise.resolve(builder).then(() => {}, (err) => {
    console.warn('[DB] safeFire:', err && err.message ? err.message : err);
  });
}

module.exports = supabase;
module.exports.supabase     = supabase;
module.exports.safeQuery    = safeQuery;
module.exports.safeFire     = safeFire;
module.exports.CONFIGURED   = CONFIGURED;
module.exports.USING_SERVICE = USING_SERVICE;
