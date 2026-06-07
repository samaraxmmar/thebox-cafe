/* ══════════════════════════════════════════════════════
   THE BOX — Tables List View (mobile)
   Vue liste des tables avec recherche, filtres, tri.
   Cards avec status badges et CTA primaires inline.
═══════════════════════════════════════════════════════ */

const TablesListView = (function() {

  function render(opts) {
    const host = document.getElementById('mobile-tables-host');
    if (!host) return;

    const tables = _filterAndSort(_getAllTables(), opts || {});

    host.innerHTML = `
      <div class="mobile-tables-list">
        ${tables.length === 0
          ? _emptyState(opts)
          : tables.map(_cardTemplate).join('')}
      </div>
    `;

    // Attache les events
    host.querySelectorAll('.mobile-table-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        TablesMobile.selectTable(id);
      });
    });

    // Swipe gestures
    if (window.Gestures) {
      Gestures.attachSwipe(host.querySelectorAll('.mobile-table-card'), {
        onSwipeLeft:  (el) => TablesMobile.quickReserve(parseInt(el.dataset.id)),
        onSwipeRight: (el) => TablesMobile.quickOpen(parseInt(el.dataset.id)),
      });
      Gestures.attachLongPress(host.querySelectorAll('.mobile-table-card'),
        (el) => TablesMobile.showActionWheel(parseInt(el.dataset.id))
      );
    }
  }

  // ── Filtre & tri ────────────────────────────────────────
  function _filterAndSort(tables, opts) {
    let list = tables.filter((t) => t.kind !== 'wall');
    // Zone
    if (opts.zone && opts.zone !== 'Toutes') {
      list = list.filter((t) => (t.zone || 'Salle') === opts.zone);
    }
    // Filtre statut
    if (opts.statusFilter && opts.statusFilter !== 'all') {
      list = list.filter((t) => _statusOf(t) === opts.statusFilter);
    }
    // Search
    if (opts.search) {
      const q = opts.search.toLowerCase();
      list = list.filter((t) =>
        (t.nom || ('Table ' + t.id)).toLowerCase().includes(q) ||
        (t.zone || '').toLowerCase().includes(q)
      );
    }
    // Tri
    const sort = opts.sort || 'activity';
    list.sort((a, b) => {
      if (sort === 'name') {
        return (a.nom || '').localeCompare(b.nom || '', undefined, { numeric: true });
      }
      if (sort === 'capacity') {
        return (b.capacite || 0) - (a.capacite || 0);
      }
      // 'activity' : occupées d'abord (par durée croissante), puis réservées, puis libres
      const sa = _statusOrder(_statusOf(a));
      const sb = _statusOrder(_statusOf(b));
      if (sa !== sb) return sa - sb;
      return (a.nom || '').localeCompare(b.nom || '', undefined, { numeric: true });
    });
    return list;
  }

  function _statusOrder(s) {
    return { occupee: 0, reservee: 1, cleaning: 2, libre: 3 }[s] ?? 9;
  }

  // ── Card template ───────────────────────────────────────
  function _cardTemplate(t) {
    const status = _statusOf(t);
    const session = _sessionOf(t);
    const statusLbl = _statusLabel(status);

    return `
      <article class="mobile-table-card" data-id="${t.id}" data-status="${status}">
        <div class="mobile-card-bar"></div>
        <div class="mobile-card-content">
          <div class="mobile-card-head">
            <div>
              <h3 class="mobile-card-name">${_esc(t.nom || ('Table ' + t.id))}</h3>
              <div class="mobile-card-meta">${_esc(t.zone || 'Salle')} · ${t.capacite || 4} places</div>
            </div>
            <span class="mobile-card-status status-${status}">${statusLbl}</span>
          </div>
          ${_metricsBlock(t, session, status)}
          <div class="mobile-card-actions">
            ${_actionBtn(t, status, session)}
          </div>
        </div>
      </article>
    `;
  }

  function _metricsBlock(t, session, status) {
    if (status === 'occupee' && session) {
      const dur = _timeSince(session.ouverte_at);
      const total = _getTotal(t.id);
      const opener = session.opened_by || '—';
      return `
        <div class="mobile-card-info">
          <span class="mci-pill">⏱ ${dur}</span>
          <span class="mci-pill">💰 ${total > 0 ? total.toFixed(2) + ' DT' : '—'}</span>
          <span class="mci-pill mci-opener">👤 ${_esc(opener)}</span>
        </div>
      `;
    }
    if (status === 'reservee' && t.reservation) {
      const r = t.reservation;
      const when = _formatReservationTime(r.date_time);
      return `
        <div class="mobile-card-info">
          <span class="mci-pill">📅 ${when}</span>
          <span class="mci-pill">👥 ${r.nb_couverts || 2} couverts</span>
          <span class="mci-pill mci-client">${_esc(r.client_name || '—')}</span>
        </div>
      `;
    }
    return '';
  }

  function _actionBtn(t, status, session) {
    if (status === 'occupee') {
      return `<button class="btn-mobile-primary" onclick="event.stopPropagation(); TablesMobile.openOrderQuick(${t.id})">📋 Reprendre la commande →</button>`;
    }
    if (status === 'reservee') {
      return `<button class="btn-mobile-secondary" onclick="event.stopPropagation(); TablesMobile.selectTable(${t.id})">Voir détails →</button>`;
    }
    return `<button class="btn-mobile-primary" onclick="event.stopPropagation(); TablesMobile.quickOpen(${t.id})">+ Ouvrir & commander</button>`;
  }

  // ── Empty state ─────────────────────────────────────────
  function _emptyState(opts) {
    if (opts && opts.search) {
      return `
        <div class="mobile-empty">
          <div class="mobile-empty-icon">🔍</div>
          <div class="mobile-empty-title">Aucun résultat pour "${_esc(opts.search)}"</div>
          <div class="mobile-empty-sub">Essaie un autre terme ou efface la recherche</div>
          <button class="btn-mobile-secondary" onclick="TablesMobile.setSearch('')">Effacer la recherche</button>
        </div>
      `;
    }
    return `
      <div class="mobile-empty">
        <div class="mobile-empty-icon">🪑</div>
        <div class="mobile-empty-title">Aucune table dans cette zone</div>
        <div class="mobile-empty-sub">Change de zone ou crée une nouvelle table</div>
      </div>
    `;
  }

  // ── Helpers (proxy vers Tables) ─────────────────────────
  function _getAllTables() {
    return (window.Tables && window.Tables._getTables) ? window.Tables._getTables() : [];
  }
  function _sessionOf(t) {
    const s = window.Tables && window.Tables._getSessions ? window.Tables._getSessions() : {};
    return s[t.id];
  }
  function _statusOf(t) {
    if (_sessionOf(t)) return 'occupee';
    if (t.statut === 'reservee') return 'reservee';
    if (t.statut === 'cleaning') return 'cleaning';
    return 'libre';
  }
  function _statusLabel(s) {
    return { libre: 'Libre', occupee: 'Occupée', reservee: 'Réservée', cleaning: 'Nettoyage' }[s] || s;
  }
  function _getTotal(id) {
    if (window.Tables && window.Tables.getTableTotal) return window.Tables.getTableTotal(id);
    return 0;
  }
  function _timeSince(d) {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return "à l'instant";
    if (diff < 60) return diff + ' min';
    const h = Math.floor(diff / 60);
    return h + 'h' + String(diff % 60).padStart(2, '0');
  }
  function _formatReservationTime(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { render };
})();
