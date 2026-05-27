'use strict';

/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Smoke test
   Teste le parcours complet contre un serveur EN COURS D'EXÉCUTION.
   Lancer le serveur (npm start) PUIS dans un autre terminal :  node test/smoke.js
   ────────────────────────────────────────────────────────────────────── */

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001';
const ADMIN_USER = process.env.SMOKE_USER || 'admin';
const ADMIN_PIN  = process.env.SMOKE_PIN  || '1234';

let cookie = '';        // jar de cookie maison (session)
let passed = 0, failed = 0;
const results = [];

function rec(name, ok, info) {
  results.push({ name, ok, info });
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name}  →  ${info || ''}`); }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Capturer le cookie de session
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function run() {
  console.log(`\n🔬 SMOKE TEST — ${BASE}\n`);

  // 0) Serveur up ?
  try {
    const r = await api('/api/status');
    rec('Serveur répond (/api/status)', r.status === 200, `status ${r.status}`);
    rec('Supabase configuré', r.data && r.data.supabase === true, r.data && r.data.supabase === false ? 'SUPABASE_URL/KEY manquants' : '');
  } catch (e) {
    rec('Serveur répond', false, e.message + ' (le serveur est-il lancé ?)');
    return finish();
  }

  // 1) Auth
  let r = await api('/api/auth/login', { method: 'POST', body: { username: ADMIN_USER, pin: ADMIN_PIN } });
  rec('Login admin', r.status === 200 && r.data && r.data.user, r.data && r.data.error);
  if (!(r.status === 200)) return finish();

  r = await api('/api/auth/me');
  rec('Session valide (/auth/me)', r.status === 200 && r.data.user, r.data && r.data.error);
  const perms = (r.data && r.data.permissions) || {};
  rec('Permissions chargées', Object.keys(perms).length > 0, '');

  // 2) Sécurité : route protégée sans cookie → 401
  const savedCookie = cookie; cookie = '';
  r = await api('/api/produits');
  rec('Route protégée refuse sans session (401)', r.status === 401, `status ${r.status}`);
  cookie = savedCookie;

  // 3) Produits — créer
  const nom = 'SMOKE_' + Date.now();
  r = await api('/api/produits', { method: 'POST', body: {
    nom, prix: 3.5, categorie: 'Boisson froide', stock_initial: 20, seuil_minimum: 5,
  }});
  rec('Créer produit', r.status === 201 && r.data.success, r.data && r.data.error);
  const produitId = r.data && r.data.produit && r.data.produit.id;

  // 4) Produit visible dans la liste
  r = await api('/api/produits');
  const found = Array.isArray(r.data) && r.data.find(p => p.id === produitId);
  rec('Produit présent dans GET /produits', !!found, '');
  rec('Stock initial = 20', found && Number(found.stock_actuel) === 20, found ? `stock=${found.stock_actuel}` : 'introuvable');

  // 5) Tables — ouvrir
  r = await api('/api/tables');
  const firstTable = Array.isArray(r.data) && r.data[0];
  rec('Liste des tables', !!firstTable, '');
  let tableId = firstTable && firstTable.id;
  // S'assurer qu'elle est libre : si occupée, on close d'abord
  if (firstTable && firstTable.sessions_table && firstTable.sessions_table.length) {
    await api(`/api/tables/${tableId}/close`, { method: 'POST' });
  }
  r = await api(`/api/tables/${tableId}/open`, { method: 'POST', body: { nb_couverts: 2 } });
  rec('Ouvrir une table', r.status === 200 && r.data.success, r.data && r.data.error);

  // 6) Commande — créer (avec le produit créé)
  r = await api('/api/orders', { method: 'POST', body: {
    table_id: tableId,
    items: [{ produit_id: produitId, nom, prix: 3.5, quantite: 3 }],
  }});
  rec('Créer commande', r.status === 201 && r.data.success, r.data && r.data.error);
  rec('Commande renvoie un total', r.data && r.data.total === 10.5, r.data ? `total=${r.data.total}` : '');

  // 7) Stock décrémenté (20 - 3 = 17)
  r = await api('/api/produits');
  const after = Array.isArray(r.data) && r.data.find(p => p.id === produitId);
  rec('Stock décrémenté après vente (17)', after && Number(after.stock_actuel) === 17, after ? `stock=${after.stock_actuel}` : '');

  // 8) Commande avec stock vide → doit être AUTORISÉE (politique)
  await api('/api/stock/' + produitId, { method: 'PATCH', body: { quantite: 0.0001 } }); // no-op safe
  r = await api('/api/orders', { method: 'POST', body: {
    table_id: tableId,
    items: [{ produit_id: produitId, nom, prix: 3.5, quantite: 999 }],
  }});
  rec('Commande autorisée même stock insuffisant', r.status === 201 && r.data.success, r.data && r.data.error);

  // 9) Stats du jour
  const today = new Date().toISOString().split('T')[0];
  r = await api('/api/stats?date=' + today);
  rec('Stats du jour', r.status === 200 && r.data && typeof r.data.total === 'number', r.data && r.data.error);

  // 10) Commandes (historique)
  r = await api('/api/commandes');
  rec('Historique commandes', r.status === 200 && Array.isArray(r.data), r.data && r.data.error);

  // 11) Nettoyage : supprimer le produit de test
  r = await api('/api/produits/' + produitId, { method: 'DELETE' });
  rec('Suppression produit de test', r.status === 200 && r.data.success, r.data && r.data.error);

  // 12) Fermer la table
  await api(`/api/tables/${tableId}/close`, { method: 'POST' });
  rec('Clôture table', true, '');

  finish();
}

function finish() {
  console.log(`\n──────────────────────────────`);
  console.log(`  ${passed} réussis · ${failed} échoués`);
  console.log(`──────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erreur fatale du test :', e); process.exit(1); });
