/* ══════════════════════════════════════════════════════
   THE BOX — App bootstrap
══════════════════════════════════════════════════════ */

const App = {
  async init() {
    this._startClock();
    this._monitorOnline();
    this._registerServiceWorker();
    this._initMobileMode();

    // ─── PHASE 1 : Affichage immédiat depuis cache localStorage ───
    try { Store.hydrateFromCache(); } catch (e) { console.warn('[App] hydrateFromCache', e); }
    try { if (typeof Tables !== 'undefined' && Tables._load) Tables._load(); } catch (e) {}

    // Naviguer immédiatement sur la première page autorisée
    var first = ['caisse','tables','dashboard','produits','stock','users','parametres'].find(function(p){
      return Auth.can(Nav._gates[p]);
    });
    if (first) {
      try { Nav.go(first); } catch (e) { console.warn('[App] Nav.go', e); }
    }

    // ─── SAFETY NET : force re-render après chaque étape clé ──
    // Étape 1 : 300ms après init (DOM stabilisé)
    setTimeout(function() {
      try {
        if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
      } catch (e) { console.warn('[App] safety 300ms', e); }
    }, 300);
    // Étape 2 : 1.2s après init (si load API a réussi)
    setTimeout(function() {
      try {
        var caissePage = document.getElementById('page-caisse');
        var grid = document.getElementById('products-grid');
        if (caissePage && caissePage.classList.contains('active') && grid) {
          var html = grid.innerHTML || '';
          // Détection initial loading : contient "Chargement" mais SANS "spinner" de mon nouveau code
          var stillStuck = html.indexOf('Chargement') >= 0 && html.indexOf('class="empty-state"') < 0;
          if (stillStuck && typeof Caisse !== 'undefined' && Caisse.render) {
            console.warn('[App] grid stuck → re-render');
            Caisse.render();
          }
        }
      } catch (e) { console.warn('[App] safety 1.2s', e); }
    }, 1200);

    // ─── PHASE 2 : Refresh des données depuis le serveur en parallèle ───
    Promise.all([
      API.getSettings().then(s => { if (s && !s.error) window._cachedSettings = s; }).catch(()=>{}),
      Store.loadProduits({ useCache: false }).catch(()=>{}),
      Store.loadIngredients({ useCache: false }).catch(()=>{}),
    ]).then(() => {
      try {
        if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
        if (typeof Dashboard !== 'undefined' && document.getElementById('page-dashboard').classList.contains('active')) Dashboard.render();
      } catch (e) { console.warn('refresh re-render', e); }
    });

    this._pollStatus();
    setInterval(() => this._pollStatus(), 30000);
    this._pollOrdersCount();
    setInterval(() => this._pollOrdersCount(), 30000);
  },

  bootstrap() {
    this._startClock();
    Auth.tryRestoreSession();
  },

  _startClock() {
    const tick = () => {
      const now = new Date();
      const cl  = document.getElementById('clock');
      if (cl) cl.textContent = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const cd  = document.getElementById('caisse-date');
      if (cd) cd.textContent = now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    };
    tick();
    setInterval(tick, 1000);
  },

  // Active le mode mobile : override Tables.render par TablesMobile.render
  _initMobileMode() {
    if (typeof MobileDetect === 'undefined' || !MobileDetect.isMobile()) return;
    if (typeof TablesMobile === 'undefined' || typeof Tables === 'undefined') return;
    // Garde une référence au render desktop au cas où
    if (!Tables._desktopRender) Tables._desktopRender = Tables.render;
    Tables.render = TablesMobile.render;
    console.log('[App] Mode mobile activé — Tables.render → TablesMobile.render');
  },

  // PWA : enregistre le service worker pour install + cache offline
  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Skip en dev local pour éviter les surprises de cache pendant le dev
    // (active seulement si servi via HTTPS ou domaine réel ; pas sur 127.0.0.1)
    if (location.hostname === 'localhost' || location.hostname.startsWith('127.')) {
      console.log('[PWA] Service worker désactivé en dev local');
      return;
    }
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service worker enregistré');
          // Détecte mise à jour disponible → propose un refresh
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                if (window.Toast) Toast.info('🔄 Nouvelle version disponible — recharge la page');
              }
            });
          });
        })
        .catch((err) => console.warn('[PWA] SW erreur :', err.message));
    });
  },

  _monitorOnline() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;

    const show = () => { banner.style.display = 'block'; };
    const hide = () => { banner.style.display = 'none'; };

    if (!navigator.onLine) show();

    window.addEventListener('online', () => {
      hide();
      Toast.success('Connexion rétablie');
      Store.reload();
    });

    window.addEventListener('offline', () => {
      show();
    });
  },

  async _pollStatus() {
    const dot = document.getElementById('api-dot');
    const lbl = document.getElementById('api-status');
    const res = await API.status();

    if (res && res.server) {
      dot.style.background = 'var(--green)';
      lbl.textContent      = res.whatsapp ? '📱 WA connecté' : 'WA hors ligne';
    } else {
      dot.style.background = 'var(--red)';
      lbl.textContent      = '⚠️ Serveur hors ligne';
    }

    // Nettoyer un éventuel ancien bandeau migration
    const b = document.getElementById('migration-banner');
    if (b) b.remove();

    // Bandeau si Supabase non configuré
    if (res && res.supabase === false) {
      this._showSupabaseBanner();
    } else {
      const sb = document.getElementById('supabase-banner');
      if (sb) sb.remove();
    }
  },

  async _pollOrdersCount() {
    // 1) Affiche d'abord la valeur en cache pour éviter le "0" au refresh
    try {
      const cached = parseInt(localStorage.getItem('thebox_cmd_count') || '');
      if (!isNaN(cached) && cached >= 0) {
        const el = document.getElementById('cmd-count');
        if (el) el.textContent = cached + ' commande(s) aujourd\'hui';
      }
    } catch (_) {}
    // 2) Fetch la valeur fraîche
    try {
      const r = await fetch('/api/stats/count-today', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) {
        console.warn('[_pollOrdersCount] HTTP', r.status);
        return;
      }
      const j = await r.json();
      console.log('[_pollOrdersCount] response', j);
      const count = parseInt(j.count);
      const el = document.getElementById('cmd-count');
      if (el && !isNaN(count)) {
        el.textContent = count + ' commande(s) aujourd\'hui';
        try { localStorage.setItem('thebox_cmd_count', String(count)); } catch (_) {}
      } else if (el && j.error) {
        console.warn('[_pollOrdersCount] erreur API:', j.error);
      }
    } catch (e) {
      console.warn('[_pollOrdersCount] exception', e);
    }
  },

  _showSupabaseBanner() {
    if (document.getElementById('supabase-banner')) return;
    const div = document.createElement('div');
    div.id = 'supabase-banner';
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:#d72c0d;color:#fff;padding:12px 16px;text-align:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2)';
    div.innerHTML = '⚠ Supabase non configuré — édite <code style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:4px">%APPDATA%\\TheBox\\.env</code> (SUPABASE_URL + SUPABASE_KEY) puis relance l\'application.';
    document.body.appendChild(div);
  },
};

// Auto-restore au chargement
document.addEventListener('DOMContentLoaded', function() { App.bootstrap(); });