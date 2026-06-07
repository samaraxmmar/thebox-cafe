/* ──────────────────────────────────────────────────────────────────────
   THE BOX — Service Worker (PWA)
   - Cache "App Shell" : CSS, JS, fonts → instantané au démarrage
   - Stratégie réseau-d'abord pour /api/* (toujours frais)
   - Stratégie cache-d'abord pour les assets statiques
   ────────────────────────────────────────────────────────────────────── */

const CACHE_VERSION = 'thebox-v2-mobile';
const CACHE_NAME    = 'thebox-shell-' + CACHE_VERSION;

const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/components.css',
  '/css/pages.css',
  '/css/mobile.css',
  '/js/app.js',
  '/js/api.js',
  '/js/store.js',
  '/js/tables.js',
  '/js/caisse.js',
  '/js/commandes.js',
  '/js/dashboard.js',
  '/js/nav.js',
  '/js/mobile/mobile-detect.js',
  '/js/mobile/gestures.js',
  '/js/mobile/bottom-sheet.js',
  '/js/mobile/tables-list-view.js',
  '/js/mobile/tables-plan-view.js',
  '/js/mobile/tables-mobile.js',
  '/manifest.json',
];

// Install : pré-cache de l'app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES).catch((err) => {
        console.warn('[SW] pre-cache partiel :', err.message);
      });
    })
  );
  self.skipWaiting();
});

// Activate : nettoie les vieilles caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('thebox-shell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch : 2 stratégies différentes selon l'URL
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorer les non-GET (POST/PATCH/DELETE → toujours réseau)
  if (req.method !== 'GET') return;
  // Ignorer les requêtes cross-origin
  if (url.origin !== location.origin) return;

  // API : réseau-d'abord (data toujours fraîche)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Assets : cache-d'abord (rapide)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache la nouvelle ressource (clone car le body ne peut être lu qu'une fois)
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html')); // fallback offline → page principale
    })
  );
});

// Message handler : permet de forcer un update depuis l'app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
