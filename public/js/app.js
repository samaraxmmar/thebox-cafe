/* ══════════════════════════════════════════════════════
   THE BOX — App bootstrap
══════════════════════════════════════════════════════ */

const App = {
  async init() {
    this._startClock();
    this._monitorOnline();

    // ─── PHASE 1 : Affichage immédiat depuis cache localStorage ───
    Store.hydrateFromCache();             // produits + ingrédients depuis cache
    if (typeof Tables !== 'undefined' && Tables._load) Tables._load(); // tables cache locale

    // Naviguer immédiatement sur la première page autorisée
    var first = ['caisse','tables','dashboard','produits','stock','users','parametres'].find(function(p){
      return Auth.can(Nav._gates[p]);
    });
    if (first) Nav.go(first);

    // ─── PHASE 2 : Refresh des données depuis le serveur en parallèle ───
    Promise.all([
      API.getSettings().then(s => { if (s && !s.error) window._cachedSettings = s; }).catch(()=>{}),
      Store.loadProduits({ useCache: false }),
      Store.loadIngredients({ useCache: false }),
    ]).then(() => {
      // Re-render la page courante avec les données fraîches
      try {
        if (typeof Caisse !== 'undefined' && Caisse.render) Caisse.render();
        if (typeof Dashboard !== 'undefined' && document.getElementById('page-dashboard').classList.contains('active')) Dashboard.render();
      } catch (e) { console.warn('refresh re-render', e); }
    });

    this._pollStatus();
    setInterval(() => this._pollStatus(), 30000);
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