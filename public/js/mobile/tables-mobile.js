/* ══════════════════════════════════════════════════════
   THE BOX — Tables Mobile Orchestrator
   Coordonne List View, Plan View, Bottom Sheet, FAB et search/filter/sort.
═══════════════════════════════════════════════════════ */

const TablesMobile = (function() {
  let _view = 'list';            // 'list' | 'plan'
  let _zone = 'Toutes';
  let _search = '';
  let _sort = 'activity';        // 'activity' | 'name' | 'capacity'
  let _statusFilter = 'all';     // 'all' | 'libre' | 'occupee' | 'reservee'
  let _selectedId = null;

  // ── Render principal ────────────────────────────────────
  function render() {
    const page = document.getElementById('page-tables');
    if (!page) return;

    const content = page.querySelector('.page-content');
    if (!content) return;

    // Une seule fois : remplace le contenu desktop par la coque mobile
    if (!page.dataset.mobileInit) {
      content.innerHTML = _shellHTML();
      page.dataset.mobileInit = '1';
      _wireSearch();
      _wireViewToggle();
      _wireSortDropdown();
      _wireStatusFilter();
    }

    _renderKpiStrip();
    _renderZones();
    _renderActiveView();
    _renderFab();
  }

  // ── Coque HTML mobile ───────────────────────────────────
  function _shellHTML() {
    return `
      <div class="mobile-tables-shell">
        <!-- KPI strip horizontal scrollable -->
        <div class="mobile-kpi-strip" id="mobile-kpi-strip"></div>

        <!-- Search bar sticky -->
        <div class="mobile-search-bar">
          <span class="mobile-search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input type="search" id="mobile-search-input" placeholder="Rechercher T1, Manel, Salle...">
          <button class="mobile-search-clear" id="mobile-search-clear" aria-label="Effacer">×</button>
        </div>

        <!-- View toggle Plan / Liste -->
        <div class="mobile-view-toggle" role="tablist">
          <button class="mvt-btn active" data-view="list" role="tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
            Liste
          </button>
          <button class="mvt-btn" data-view="plan" role="tab">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Plan
          </button>
        </div>

        <!-- Zones segmented control scrollable -->
        <div class="mobile-zones" id="mobile-zones"></div>

        <!-- Sort + Status filter row -->
        <div class="mobile-filter-row">
          <button class="mobile-filter-btn" id="mobile-sort-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h13"/><path d="M3 12h9"/><path d="M3 18h5"/><path d="m17 8 4 4-4 4"/><path d="M21 12H10"/></svg>
            <span id="mobile-sort-label">Activité</span>
          </button>
          <div class="mobile-status-pills" id="mobile-status-pills">
            <button class="msp-pill active" data-status="all">Toutes</button>
            <button class="msp-pill" data-status="libre">Libres</button>
            <button class="msp-pill" data-status="occupee">Occupées</button>
            <button class="msp-pill" data-status="reservee">Réservées</button>
          </div>
        </div>

        <!-- Host pour la vue active (list ou plan) -->
        <div class="mobile-tables-host" id="mobile-tables-host"></div>

        <!-- FAB (positionné en bas à droite) -->
        <div class="mobile-fab-container" id="mobile-fab-container"></div>
      </div>
    `;
  }

  // ── Sections render ─────────────────────────────────────
  function _renderKpiStrip() {
    const el = document.getElementById('mobile-kpi-strip');
    if (!el) return;
    const tables = _getAllTables().filter((t) => t.kind !== 'wall');
    const sessions = _getSessions();
    const total = tables.length;
    const occupied = Object.keys(sessions).length;
    const reserved = tables.filter((t) => t.statut === 'reservee').length;
    const available = total - occupied - reserved;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    el.innerHTML = `
      <div class="mkpi total"><span class="mkpi-val">${total}</span><span class="mkpi-lbl">Total</span></div>
      <div class="mkpi occ"><span class="mkpi-val">${occupied}</span><span class="mkpi-lbl">Occupées</span></div>
      <div class="mkpi res"><span class="mkpi-val">${reserved}</span><span class="mkpi-lbl">Réservées</span></div>
      <div class="mkpi free"><span class="mkpi-val">${available}</span><span class="mkpi-lbl">Libres</span></div>
      <div class="mkpi rate"><span class="mkpi-val">${rate}%</span><span class="mkpi-lbl">Occupation</span></div>
    `;
  }

  function _renderZones() {
    const el = document.getElementById('mobile-zones');
    if (!el) return;
    const tables = _getAllTables().filter((t) => t.kind !== 'wall');
    const zones = ['Toutes', ...new Set(tables.map((t) => t.zone || 'Salle'))];
    el.innerHTML = zones.map((z) => {
      const count = z === 'Toutes' ? tables.length : tables.filter((t) => (t.zone || 'Salle') === z).length;
      return `<button class="mobile-zone-chip ${z === _zone ? 'active' : ''}"
                onclick="TablesMobile.setZone('${z.replace(/'/g, "\\'")}')">
                ${_esc(z)} <span class="mzc-count">${count}</span>
              </button>`;
    }).join('');
  }

  function _renderActiveView() {
    const opts = { zone: _zone, search: _search, sort: _sort, statusFilter: _statusFilter };
    if (_view === 'list') TablesListView.render(opts);
    else                  TablesPlanView.render(opts);
  }

  function _renderFab() {
    const el = document.getElementById('mobile-fab-container');
    if (!el) return;
    const canAdmin = window.Auth && window.Auth.can && window.Auth.can('tables.admin');
    if (!canAdmin) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button class="mobile-fab" onclick="Tables.openAddModal && Tables.openAddModal()" aria-label="Ajouter une table">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    `;
  }

  // ── Wirings (au premier render) ─────────────────────────
  function _wireSearch() {
    const input = document.getElementById('mobile-search-input');
    const clearBtn = document.getElementById('mobile-search-clear');
    if (!input) return;
    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => setSearch(input.value), 150);
    });
    if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; setSearch(''); input.focus(); });
  }

  function _wireViewToggle() {
    const btns = document.querySelectorAll('.mvt-btn');
    btns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  }

  function _wireSortDropdown() {
    const btn = document.getElementById('mobile-sort-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = { activity: 'name', name: 'capacity', capacity: 'activity' };
      const labels = { activity: 'Activité', name: 'Nom', capacity: 'Capacité' };
      _sort = next[_sort] || 'activity';
      document.getElementById('mobile-sort-label').textContent = labels[_sort];
      _renderActiveView();
    });
  }

  function _wireStatusFilter() {
    const pills = document.querySelectorAll('.msp-pill');
    pills.forEach((p) => p.addEventListener('click', () => {
      pills.forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
      _statusFilter = p.dataset.status;
      _renderActiveView();
    }));
  }

  // ── Setters publics ─────────────────────────────────────
  function setView(v) {
    _view = v;
    document.querySelectorAll('.mvt-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    _renderActiveView();
  }
  function setZone(z) {
    _zone = z;
    _renderZones();
    _renderActiveView();
  }
  function setSearch(s) {
    _search = (s || '').trim();
    const clearBtn = document.getElementById('mobile-search-clear');
    if (clearBtn) clearBtn.style.display = _search ? 'flex' : 'none';
    const input = document.getElementById('mobile-search-input');
    if (input && input.value !== s) input.value = s;
    _renderActiveView();
  }

  // ── Actions tables (déléguées à Tables desktop) ─────────
  function selectTable(id) {
    _selectedId = id;
    const t = _getAllTables().find((x) => x.id === id);
    if (!t || t.kind === 'wall') return;
    if (window.Tables && window.Tables.select) window.Tables.select(id);
    _openDetailsBottomSheet(t);
  }

  function quickOpen(id) {
    const t = _getAllTables().find((x) => x.id === id);
    if (!t) return;
    const sess = _getSessions()[id];
    if (sess) { openOrderQuick(id); return; }
    // Sélectionne puis ouvre la modal "couverts" du flow normal
    if (window.Tables && window.Tables.select) window.Tables.select(id);
    if (window.Tables && window.Tables.actionSelected) window.Tables.actionSelected();
  }

  function quickReserve(id) {
    if (window.Tables && window.Tables.openReservationModal) window.Tables.openReservationModal(id);
  }

  function openOrderQuick(id) {
    if (window.Tables && window.Tables.select) window.Tables.select(id);
    if (window.Tables && window.Tables.actionSelected) window.Tables.actionSelected();
  }

  // ── Bottom Sheet "détails table" ────────────────────────
  function _openDetailsBottomSheet(t) {
    const status = _statusOf(t);
    const session = _getSessions()[t.id];
    const statusLbl = _statusLabel(status);
    const total = session ? _getTotal(t.id) : 0;
    const items = session ? _getItemCount(t.id) : 0;

    const html = `
      <header class="mbs-head status-${status}">
        <div class="mbs-bandeau"></div>
        <div class="mbs-status-row">
          <span class="mbs-status">${statusLbl}</span>
          <button class="mbs-close" onclick="BottomSheet.close()" aria-label="Fermer">×</button>
        </div>
        <h2 class="mbs-title">${_esc(t.nom || ('Table ' + t.id))}</h2>
        <div class="mbs-subtitle">${_esc(t.zone || 'Salle')}</div>
      </header>

      <section class="mbs-metrics">
        <div class="mbs-metric"><div class="mbs-m-lbl">Capacité</div><div class="mbs-m-val">${t.capacite || 4}</div></div>
        ${session ? `<div class="mbs-metric"><div class="mbs-m-lbl">Couverts</div><div class="mbs-m-val">${session.nb_couverts || 0}</div></div>` : ''}
        ${session ? `<div class="mbs-metric"><div class="mbs-m-lbl">Ouvert à</div><div class="mbs-m-val">${_formatTime(session.ouverte_at)}</div></div>` : ''}
        ${session ? `<div class="mbs-metric"><div class="mbs-m-lbl">Durée</div><div class="mbs-m-val">${_timeSince(session.ouverte_at)}</div></div>` : ''}
      </section>

      ${session ? `
        <section class="mbs-bill">
          <div class="mbs-bill-row"><span>Articles</span><strong>${items}</strong></div>
          <div class="mbs-bill-divider"></div>
          <div class="mbs-bill-row mbs-bill-total"><span>Total en cours</span><strong>${total.toFixed(3)} DT</strong></div>
        </section>
      ` : ''}

      <section class="mbs-actions">
        ${_actionBtnsHTML(t, status, session)}
      </section>
    `;

    BottomSheet.open(html);
  }

  function _actionBtnsHTML(t, status, session) {
    const canManage = window.Auth && window.Auth.can && window.Auth.can('orders.create');
    const canAdmin  = window.Auth && window.Auth.can && window.Auth.can('tables.admin');
    let html = '';
    if (canManage) {
      if (session) {
        html += `<button class="btn-mobile-primary" onclick="TablesMobile.openOrderQuick(${t.id})">Reprendre la commande →</button>`;
      } else {
        html += `<button class="btn-mobile-primary" onclick="BottomSheet.close(); TablesMobile.quickOpen(${t.id})">▶ Ouvrir & commander</button>`;
      }
    }
    if (canManage && !session && status !== 'reservee') {
      html += `<button class="btn-mobile-secondary" onclick="BottomSheet.close(); TablesMobile.quickReserve(${t.id})">Réserver la table</button>`;
    }
    if (session) {
      if (canAdmin) html += `<button class="btn-mobile-secondary" onclick="window.Tables.promptTransfer(${t.id}); BottomSheet.close();">⇄ Transférer la table</button>`;
      if (canAdmin) html += `<button class="btn-mobile-secondary" onclick="window.Tables.printBill(${t.id}); BottomSheet.close();">Imprimer l'addition</button>`;
      if (canAdmin) html += `<button class="btn-mobile-danger" onclick="window.Tables.closeFromPanel(${t.id}); BottomSheet.close();">Fermer la table</button>`;
    }
    if (canAdmin) html += `<button class="btn-mobile-ghost" onclick="window.Tables.openEditModal(${t.id}); BottomSheet.close();">Modifier la table</button>`;
    return html;
  }

  // ── Action Wheel (long-press) ───────────────────────────
  function showActionWheel(id) {
    selectTable(id); // Pour simplicité, on ouvre le bottom sheet
    // (Wheel circulaire = polish optionnel, le bottom sheet remplit déjà le rôle)
  }

  // ── Helpers ─────────────────────────────────────────────
  function _getAllTables() { return (window.Tables && window.Tables._getTables) ? window.Tables._getTables() : []; }
  function _getSessions()  { return (window.Tables && window.Tables._getSessions) ? window.Tables._getSessions() : {}; }
  function _getTotal(id)   { return (window.Tables && window.Tables.getTableTotal) ? window.Tables.getTableTotal(id) : 0; }
  function _getItemCount(id) { return (window.Tables && window.Tables.getTableCount) ? window.Tables.getTableCount(id) : 0; }
  function _statusOf(t) {
    if (_getSessions()[t.id]) return 'occupee';
    if (t.statut === 'reservee') return 'reservee';
    if (t.statut === 'cleaning') return 'cleaning';
    return 'libre';
  }
  function _statusLabel(s) { return { libre: 'Libre', occupee: 'Occupée', reservee: 'Réservée', cleaning: 'En nettoyage' }[s] || s; }
  function _timeSince(d) {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return "à l'instant";
    if (diff < 60) return diff + ' min';
    const h = Math.floor(diff / 60);
    return h + 'h' + String(diff % 60).padStart(2, '0');
  }
  function _formatTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return {
    render, setView, setZone, setSearch,
    selectTable, quickOpen, quickReserve, openOrderQuick, showActionWheel,
  };
})();
