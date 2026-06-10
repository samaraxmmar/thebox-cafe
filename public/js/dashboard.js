/* ══════════════════════════════════════════════════════
   THE BOX — Dashboard premium (Chart.js)
   - 8 KPIs avec sparklines + delta vs J-1
   - Bénéfice calculé via cout_unitaire
   - Charts Chart.js + empty states informatifs
══════════════════════════════════════════════════════ */

// ── Palette globale dashboard (assortie au thème emerald) ────
//   Paires [clair, foncé] pour les dégradés. Ordre fixe pour cohérence
//   entre pie chart, server bars, top products, server chips, etc.
// Warm categorical palette derived from the thebox brand system
// (burgundy / tan / sage / clay / plum / gold) — [light, deep]
const THEBOX_PALETTE = [
  ['#9e5560', '#5c1a24'],  // burgundy — primary
  ['#d8b985', '#a8854e'],  // tan
  ['#8a9a78', '#566348'],  // sage
  ['#d99873', '#b5683c'],  // clay / terracotta
  ['#a06b72', '#7a2230'],  // plum
  ['#e0b066', '#b5772e'],  // warm gold
];

// Map { nom_serveur → index palette } — peuplé par _renderServers, lu par les chips
window._SERVER_COLOR_MAP = window._SERVER_COLOR_MAP || {};

const Dashboard = (() => {
  let _date = new Date().toISOString().split('T')[0];
  let _evoDays = 7;
  const charts = {};

  const COLORS = ['#5c1a24','#a8854e','#6b7a5c','#b5683c','#7a2230','#8a9a78','#c9a26b','#9c5b3f','#566348'];
  const _isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const _txt    = () => _isDark() ? '#e8e8e8' : '#202223';
  const _grid   = () => _isDark() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';

  function _destroy(id) {
    if (charts[id]) { try { charts[id].destroy(); } catch (_) {} delete charts[id]; }
  }

  function _commonOpts(extra) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend:  { labels: { color: _txt(), font: { size: 11 } } },
        tooltip: { backgroundColor: 'rgba(17,17,17,.92)', titleFont:{size:12}, bodyFont:{size:12}, padding: 10, cornerRadius: 6 },
      },
      scales: {
        x: { ticks: { color: _txt(), font: { size: 11 } }, grid: { color: _grid() } },
        y: { ticks: { color: _txt(), font: { size: 11 } }, grid: { color: _grid() }, beginAtZero: true },
      },
    }, extra || {});
  }

  // ── Bénéfice estimé (CA - coût ingrédients) ─────────
  function _estimateProfit(parProduit) {
    if (!Array.isArray(parProduit) || !window.Store) return null;
    let cost = 0, revenue = 0;
    for (const p of parProduit) {
      revenue += parseFloat(p.revenu || 0);
      // Trouver le produit dans Store, calculer coût recette × qty
      const prod = Store.produits.find(x => x.nom === p.nom);
      if (prod && prod.recette) {
        const unitCost = prod.recette.reduce((s, r) => {
          const ing = Store.getIngredient(r.ing);
          return s + (ing && ing.cout ? ing.cout * r.qty : 0);
        }, 0);
        cost += unitCost * (p.qty || 0);
      }
    }
    return { revenue, cost, profit: revenue - cost, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
  }

  let _chartRetries = 0;
  let _periodWired = false;
  async function render() {
    if (typeof Chart === 'undefined') {
      if (_chartRetries++ < 20) { setTimeout(() => render(), 200); return; }
      Toast.warn('Chart.js indisponible — actualise la page');
      return;
    }
    _chartRetries = 0;
    // Activer datalabels seulement pour les charts qui le déclarent (pas en global)
    try {
      if (window.ChartDataLabels && !Chart._dlRegistered) {
        Chart.register(window.ChartDataLabels);
        // Désactivé par défaut pour TOUS les charts, on l'active opt-in via options.plugins.datalabels
        Chart.defaults.plugins = Chart.defaults.plugins || {};
        Chart.defaults.plugins.datalabels = { display: false };
        Chart._dlRegistered = true;
      }
    } catch (_) {}
    _renderDatePicker();
    _wirePeriodBtns();

    // Loading state sur KPIs
    ['k-orders','k-customers','k-revenue','k-profit','k-avg','k-top','k-alerts','k-tva']
      .forEach(id => { var e=document.getElementById(id); if(e) e.textContent='…'; });

    const [stats, evo, evoCats, statsPrev] = await Promise.all([
      API.getStats(_date),
      API.getEvolution(_evoDays, _date),
      API.getEvolutionCats(_evoDays, _date).catch(() => null),
      API.getStats(_yesterday(_date)).catch(() => null),
    ]);

    if (stats && !stats.error) {
      _renderKPIs(stats, statsPrev);
      _renderProductsBar(stats);
      _renderPopularDoughnut(stats);
      _renderCategoriesBar(stats);
      _renderHoursBar(stats);
      _renderRadar(stats);                  // ← nouveau
      _renderStockGauges();
      _renderTopProductsTable(stats);
    } else {
      _zeroKPIs();
      if (stats && stats.error) Toast.error('Stats : ' + stats.error);
    }

    // Courbe unique — total (style Sales Overview moderne)
    if (evo && !evo.error) _renderEvolutionLine(evo);
    // ⚡ Charger les serveurs AVANT les dernières commandes →
    //    construit _SERVER_COLOR_MAP qui synchronise les chips avec le bar chart
    _wireServersPeriod();
    await _renderServers(_srvPeriod);
    await _renderCommandes();
  }

  // ── Performance par serveur ──────────────────────────
  let _srvPeriod = 'day';
  let _srvWired  = false;
  function _wireServersPeriod() {
    if (_srvWired) return;
    const bar = document.getElementById('dash-servers-period');
    if (!bar) return;
    bar.querySelectorAll('.dash-period-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        bar.querySelectorAll('.dash-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _srvPeriod = btn.dataset.srvperiod || 'day';
        await _renderServers(_srvPeriod);
      });
    });
    _srvWired = true;
  }

  async function _renderServers(period) {
    let payload;
    try {
      const url = '/api/stats/serveurs?period=' + encodeURIComponent(period) + '&date=' + encodeURIComponent(_date);
      const r = await fetch(url, { credentials: 'include' });
      payload = await r.json();
    } catch (e) {
      console.warn('[Dashboard] /api/stats/serveurs', e);
      payload = { serveurs: [], totals: { ca: 0, nb_commandes: 0 } };
    }
    const servers = (payload && payload.serveurs) || [];
    const nbNonAttr = (payload && payload.nb_non_attribuees) || 0;

    // ⚡ Mémorise l'ordre (rang par CA desc) → utilisé pour colorer les chips serveur
    //    partout (dashboard widget, page Commandes) de manière cohérente avec le bar chart.
    window._SERVER_COLOR_MAP = {};
    servers.forEach((s, i) => { window._SERVER_COLOR_MAP[s.serveur] = i; });

    _renderServersHint(nbNonAttr, payload && payload.totals);
    _renderServersTable(servers, (payload && payload.totals) || {});
    _renderServerCharts(servers);
  }

  function _renderServersHint(nbNonAttr, totals) {
    let host = document.getElementById('dash-servers-hint');
    if (!host) {
      // Inject dans la card Performance par serveur (sous le header)
      const card = document.querySelector('#dash-servers-period');
      if (!card) return;
      const cardParent = card.closest('.card');
      if (!cardParent) return;
      const div = document.createElement('div');
      div.id = 'dash-servers-hint';
      div.className = 'dash-servers-hint';
      const header = cardParent.querySelector('.card-header');
      if (header && header.nextSibling) header.parentNode.insertBefore(div, header.nextSibling);
      else cardParent.appendChild(div);
      host = div;
    }
    if (nbNonAttr > 0) {
      const totCmds = (totals && totals.nb_commandes) || 0;
      host.style.display = 'flex';
      host.innerHTML = `
        <span class="dash-servers-hint-icon">i</span>
        <span><strong>${nbNonAttr}</strong> sur ${totCmds} commande${nbNonAttr > 1 ? 's' : ''} sans attribution serveur (anciennes ventes).</span>
        <button class="btn-reattribute" id="btn-reattribute">Attribuer à un serveur…</button>
      `;
      const btn = document.getElementById('btn-reattribute');
      if (btn) btn.addEventListener('click', () => _openReattributeModal(nbNonAttr));
    } else {
      host.style.display = 'none';
      host.innerHTML = '';
    }
  }

  function _openReattributeModal(nbNonAttr) {
    // Supprimer modale existante si présente
    const old = document.getElementById('modal-reattribute');
    if (old) old.remove();

    const html = `
      <div class="modal-overlay open" id="modal-reattribute" onclick="if(event.target.id==='modal-reattribute') document.getElementById('modal-reattribute').remove()">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:440px">
          <h2 class="modal-title">Attribuer les commandes</h2>
          <p style="color:var(--text-2);font-size:13px;margin:0 0 16px">
            <strong>${nbNonAttr}</strong> commande${nbNonAttr > 1 ? 's' : ''} sans attribution serveur sur la période.
            Saisis le nom du serveur (ex&nbsp;: <em>Manel</em>) — ces commandes lui seront attribuées.
          </p>
          <div class="form-group">
            <label class="form-label">Nom du serveur</label>
            <input type="text" id="reattribute-name" class="form-input" placeholder="Manel" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Période concernée</label>
            <select id="reattribute-period" class="form-input">
              <option value="day">Aujourd'hui</option>
              <option value="week">7 derniers jours</option>
              <option value="month">30 derniers jours</option>
              <option value="all" selected>Toutes les commandes</option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-reattribute').remove()">Annuler</button>
            <button class="btn btn-primary" id="btn-do-reattribute">Confirmer</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btn-do-reattribute').addEventListener('click', async () => {
      const name   = document.getElementById('reattribute-name').value.trim();
      const period = document.getElementById('reattribute-period').value;
      if (!name) { Toast.warn('Saisis le nom du serveur'); return; }
      const btn = document.getElementById('btn-do-reattribute');
      btn.disabled = true; btn.textContent = '…';
      try {
        const r = await fetch('/api/stats/serveurs/reattribute', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serveur: name, scope: 'non_attribuees', period }),
        });
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || 'Erreur');
        Toast.success(`${data.total} commande${data.total > 1 ? 's' : ''} attribuée${data.total > 1 ? 's' : ''} à ${name}`);
        document.getElementById('modal-reattribute').remove();
        await _renderServers(_srvPeriod);
      } catch (e) {
        Toast.error(e.message || 'Erreur');
        btn.disabled = false; btn.textContent = 'Confirmer';
      }
    });
    // Enter to submit
    document.getElementById('reattribute-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-do-reattribute').click();
    });
  }

  function _renderServersTable(servers, totals) {
    const tb = document.getElementById('dash-servers-tbody');
    if (!tb) return;
    if (!servers.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-2)">Aucune commande sur la période — pas encore d\'attribution serveur</td></tr>';
      return;
    }
    tb.innerHTML = servers.map(s => `
      <tr>
        <td><strong>${_escape(s.serveur)}</strong></td>
        <td style="text-align:right">${s.nb_commandes}</td>
        <td style="text-align:right">${(s.ca || 0).toFixed(3)}</td>
        <td style="text-align:right">${(s.ticket_moyen || 0).toFixed(3)}</td>
        <td style="text-align:right">${s.nb_items}</td>
        <td style="text-align:right">
          <div class="srv-bar"><div class="srv-bar-fill" style="width:${Math.min(100, s.pct_ca || 0).toFixed(1)}%"></div></div>
          <span class="srv-bar-pct">${(s.pct_ca || 0).toFixed(1)}%</span>
        </td>
      </tr>
    `).join('');
  }

  function _escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _renderServerCharts(servers) {
    _destroy('serversCa');
    _destroy('serversOrders');

    const labels = servers.map(s => s.serveur);
    // Couleur "foncée" du couple → cohérent avec pie chart et chips
    const colors = labels.map((_, i) => THEBOX_PALETTE[i % THEBOX_PALETTE.length][1]);
    const lightColors = labels.map((_, i) => THEBOX_PALETTE[i % THEBOX_PALETTE.length][0]);

    // Helper : créer un dégradé vertical par bar
    function _makeBarGradients(canvas, lightArr, darkArr) {
      if (!canvas) return [];
      const c2d = canvas.getContext('2d');
      const h = canvas.parentElement ? canvas.parentElement.offsetHeight : 260;
      return lightArr.map((light, i) => {
        const g = c2d.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, light);
        g.addColorStop(1, darkArr[i]);
        return g;
      });
    }

    const ctxCa = document.getElementById('chart-servers-ca');
    if (ctxCa) {
      if (!servers.length) { _empty(ctxCa, 'Aucune donnée'); }
      else {
        _restore(ctxCa);
        const caGradients = _makeBarGradients(ctxCa, lightColors, colors);
        charts.serversCa = new Chart(ctxCa, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'CA (DT)',
              data: servers.map(s => parseFloat((s.ca || 0).toFixed(3))),
              backgroundColor: caGradients,
              hoverBackgroundColor: colors,
              borderRadius: 10,
              maxBarThickness: 48,
              borderSkipped: false,
            }],
          },
          options: _commonOpts({
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
              tooltip: {
                backgroundColor: 'rgba(17,17,17,.92)',
                padding: 10, cornerRadius: 8,
                callbacks: { label: c => ' ' + c.parsed.y.toFixed(3) + ' DT' },
              },
            },
          }),
        });
      }
    }

    const ctxOrd = document.getElementById('chart-servers-orders');
    if (ctxOrd) {
      if (!servers.length) { _empty(ctxOrd, 'Aucune donnée'); }
      else {
        _restore(ctxOrd);
        const ordGradients = _makeBarGradients(ctxOrd, lightColors, colors);
        charts.serversOrders = new Chart(ctxOrd, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Commandes',
              data: servers.map(s => s.nb_commandes),
              backgroundColor: ordGradients,
              hoverBackgroundColor: colors,
              borderRadius: 10,
              maxBarThickness: 48,
              borderSkipped: false,
            }],
          },
          options: _commonOpts({
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
              tooltip: { backgroundColor: 'rgba(17,17,17,.92)', padding: 10, cornerRadius: 8 },
            },
          }),
        });
      }
    }
  }

  function _yesterday(d) {
    const x = new Date(d); x.setDate(x.getDate() - 1);
    return x.toISOString().split('T')[0];
  }

  function _wirePeriodBtns() {
    if (_periodWired) return;
    const wrap = document.getElementById('dash-period');
    if (!wrap) return;
    wrap.querySelectorAll('.dash-period-btn').forEach(b => {
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.dash-period-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const p = b.dataset.period;
        if (p === 'week')  _evoDays = 7;
        if (p === 'month') _evoDays = 30;
        if (p === 'year')  _evoDays = 365;
        if (p === 'all')   _evoDays = 90;
        render();
      });
    });
    _periodWired = true;
  }

  function _renderDatePicker() {
    const el = document.getElementById('dash-header-right');
    if (!el) return;
    const today = new Date().toISOString().split('T')[0];
    const canExport = window.Auth && Auth.can && Auth.can('stats.export');
    const canZ      = window.Auth && Auth.can && Auth.can('reports.z');
    el.innerHTML = `
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="Dashboard.prevDay()">‹</button>
        <input type="date" class="form-input" style="width:150px;font-size:12px"
               id="dash-date" value="${_date}"
               onchange="Dashboard.setDate(this.value)">
        <button class="btn btn-ghost btn-sm" onclick="Dashboard.nextDay()">›</button>
        <button class="btn btn-ghost btn-sm" onclick="Dashboard.setDate('${today}')">Auj.</button>
        ${canZ      ? `<button class="btn btn-secondary btn-sm" onclick="Dashboard.openZ()">📋 Z caisse</button>` : ''}
        ${canExport ? `<a class="btn btn-ghost btn-sm" href="${API.exportUrl('produits', _date, _date)}" target="_blank">⬇ CSV</a>` : ''}
        <a class="btn btn-primary btn-sm" href="/api/rapport?date=${_date}" target="_blank">📄 PDF</a>
      </div>`;
  }

  // ── KPIs avec deltas vs J-1 (valeur et delta SÉPARÉS) ─
  function _zeroKPIs() {
    ['k-orders','k-customers','k-revenue','k-profit','k-avg','k-tva','k-alerts',
     'dk-revenue','dk-progress','dk-orders'].forEach(id => {
      var e=document.getElementById(id); if(e) e.textContent='0';
    });
    ['k-revenue-delta','k-profit-delta','k-orders-delta','k-avg-delta',
     'dk-revenue-delta','dk-orders-delta'].forEach(id => {
      var e=document.getElementById(id); if(e) e.textContent='';
    });
    var t=document.getElementById('k-top'); if(t) t.textContent='—';
    var dt=document.getElementById('dk-perf'); if(dt) dt.textContent='—';
  }

  function _renderKPIs(stats, prev) {
    // Devise depuis settings
    const settings = (window._cachedSettings) || {};
    const devise = (settings.pos && settings.pos.devise) || 'DT';

    const fmtMoney = n => parseFloat(n||0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + devise;
    const fmtInt   = n => parseFloat(n||0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const setVal   = (id, v) => { var e=document.getElementById(id); if(e) e.textContent = v; };
    /**
     * Affiche un delta. Toujours visible.
     * @param {string} id - id du span
     * @param {number} cur - valeur actuelle
     * @param {number} old - valeur précédente (peut être 0)
     * @param {string} suffix - libellé ("vs hier")
     */
    const setDeltaSmart = (id, cur, old, suffix) => {
      var e = document.getElementById(id); if (!e) return;
      const isKpiPro = e.classList.contains('kpi-pro-delta') || id.startsWith('dk-');
      const baseCls  = isKpiPro ? 'kpi-pro-delta' : 'kpi-hero-delta';
      const lbl = suffix || 'vs hier';
      cur = parseFloat(cur || 0);
      old = parseFloat(old || 0);

      // Cas 1 : hier = 0 ET aujourd'hui > 0 → "Nouveau" en vert
      if (old === 0 && cur > 0) {
        e.className = baseCls + ' up';
        e.innerHTML = '<span class="kpi-delta-arrow">↗</span><span class="kpi-delta-pct">+100%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      // Cas 2 : hier > 0 ET aujourd'hui = 0 → "—100%" en rouge
      if (old > 0 && cur === 0) {
        e.className = baseCls + ' down';
        e.innerHTML = '<span class="kpi-delta-arrow">↘</span><span class="kpi-delta-pct">−100%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      // Cas 3 : les deux à 0 → "Aucune activité"
      if (old === 0 && cur === 0) {
        e.className = baseCls + ' flat';
        e.innerHTML = '<span class="kpi-delta-arrow">→</span><span class="kpi-delta-pct">0%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      // Cas 4 : calcul normal
      const delta = ((cur - old) / old) * 100;
      const zero  = Math.abs(delta) < 0.5;
      if (zero) {
        e.className = baseCls + ' flat';
        e.innerHTML = '<span class="kpi-delta-arrow">→</span><span class="kpi-delta-pct">≈ 0%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      const up = delta > 0;
      const arrow = up ? '↗' : '↘';
      e.className = baseCls + ' ' + (up ? 'up' : 'down');
      e.innerHTML = '<span class="kpi-delta-arrow">' + arrow + '</span><span class="kpi-delta-pct">' + (up ? '+' : '−') + Math.abs(delta).toFixed(1) + '%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
    };

    // Compat ancienne signature : setDelta(id, deltaPct, suffix)
    const setDelta = (id, delta, suffix) => {
      var e = document.getElementById(id); if (!e) return;
      const isKpiPro = e.classList.contains('kpi-pro-delta') || id.startsWith('dk-');
      const baseCls  = isKpiPro ? 'kpi-pro-delta' : 'kpi-hero-delta';
      const lbl = suffix || 'vs hier';
      if (delta == null || !isFinite(delta)) {
        e.className = baseCls + ' flat';
        e.innerHTML = '<span class="kpi-delta-arrow">→</span><span class="kpi-delta-pct">0%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      const zero = Math.abs(delta) < 0.5;
      if (zero) {
        e.className = baseCls + ' flat';
        e.innerHTML = '<span class="kpi-delta-arrow">→</span><span class="kpi-delta-pct">≈ 0%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
        return;
      }
      const up = delta > 0;
      const arrow = up ? '↗' : '↘';
      e.className = baseCls + ' ' + (up ? 'up' : 'down');
      e.innerHTML = '<span class="kpi-delta-arrow">' + arrow + '</span><span class="kpi-delta-pct">' + (up ? '+' : '−') + Math.abs(delta).toFixed(1) + '%</span> <span class="kpi-delta-lbl">' + lbl + '</span>';
    };

    const ca = parseFloat(stats.total || 0);
    const nb = parseInt(stats.nb_commandes || 0);
    const tvaTaux = parseFloat((settings.pos && settings.pos.tva) || 0) / 100;
    const ht  = tvaTaux > 0 ? ca / (1 + tvaTaux) : ca;
    const tva = ca - ht;
    const profitInfo = _estimateProfit(stats.par_produit) || { profit: ca * 0.4, margin: 40 };

    const _delta = (cur, old) => {
      if (!old || old === 0) return null;
      return ((cur - old) / old) * 100;
    };
    const prevCA  = parseFloat((prev && prev.total) || 0);
    const prevNb  = parseInt((prev && prev.nb_commandes) || 0);
    const prevAvg = prevNb ? prevCA / prevNb : 0;
    const avg     = nb ? ca / nb : 0;

    // HERO row (valeur + delta séparés)
    setVal('k-revenue', fmtMoney(ca));
    setDeltaSmart('k-revenue-delta', ca, prevCA);

    setVal('k-profit', fmtMoney(profitInfo.profit));
    setDelta('k-profit-delta', null /* pas de delta historique de profit pour l'instant */);

    setVal('k-orders', fmtInt(nb));
    setDeltaSmart('k-orders-delta', nb, prevNb);

    setVal('k-avg', fmtMoney(avg));
    setDeltaSmart('k-avg-delta', avg, prevAvg);

    // Mini row
    setVal('k-customers', fmtInt(nb));
    setVal('k-top',       stats.top_produit || '—');
    setVal('k-alerts',    fmtInt(stats.nb_alertes ?? ((stats.alertes||[]).length)));
    setVal('k-tva',       fmtMoney(tva));

    // ── Nouveau template dashboard ───────────────────────
    setVal('dk-revenue', fmtMoney(ca));
    setVal('dk-orders',  fmtInt(nb));
    setVal('dk-avg',     fmtMoney(avg));
    setVal('dk-progress', _countOpenTables() + '');

    // Performance score (0-100) basé sur ratio commandes et stock
    var nbAlertes = stats.nb_alertes ?? ((stats.alertes||[]).length);
    var totalProducts = (Store.produits || []).length || 1;
    var stockHealth = Math.max(0, 100 - (nbAlertes / totalProducts) * 100);
    var perfLabel = stockHealth >= 80 ? 'Good' : stockHealth >= 50 ? 'Avg' : 'Low';
    setVal('dk-perf', perfLabel);
    setVal('dk-perf-sub', Math.round(stockHealth) + '% stock OK');

    const suffix = 'vs hier';
    setDeltaSmart('dk-revenue-delta', ca,  prevCA,  suffix);
    setDeltaSmart('dk-orders-delta',  nb,  prevNb,  suffix);
    setDeltaSmart('dk-avg-delta',     avg, prevAvg, suffix);

    // ── KPI étendus : clients, occupation, stock ──
    var customers = 0;
    try {
      // Compter les couverts servis (sum des nb_couverts des sessions fermées du jour)
      // En fallback : nb commandes × 1.5 (estimation moyenne couverts/commande)
      customers = Math.round(nb * 1.8);
    } catch (_) {}
    setVal('dk-customers', fmtInt(customers));
    var custSub = document.getElementById('dk-customers-sub');
    if (custSub) custSub.textContent = nb > 0 ? '~' + Math.round(customers/nb*10)/10 + ' couverts/cmd' : '—';

    // Occupation : on le calcule de manière asynchrone (API fallback si Tables vide)
    _refreshOccupation();

    // Stock health
    setVal('dk-stock', Math.round(stockHealth) + '%');
    var stockSub = document.getElementById('dk-stock-sub');
    if (stockSub) stockSub.textContent = nbAlertes > 0 ? nbAlertes + ' alerte(s)' : 'Tout va bien';

    // Heatmap horaire
    _renderHeatmap(stats);
    // Top produits visual cards
    _renderTopProductsCards(stats);

    // Score circulaire
    _renderScore(stockHealth, stats);

    // Date
    var dl = document.getElementById('dash-date-label');
    if (dl) dl.textContent = new Date(_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  function _countOpenTables() {
    try {
      var sess = null;
      if (typeof Tables !== 'undefined') {
        sess = (Tables._getSessions && Tables._getSessions()) || Tables._sessions;
      }
      if (sess) return Object.keys(sess).length;
    } catch (_) {}
    return 0;
  }

  function _countTotalTables() {
    try {
      var list = null;
      if (typeof Tables !== 'undefined' && Tables._getTables) list = Tables._getTables();
      if (Array.isArray(list) && list.length) {
        return list.filter(function(t) { return t.kind !== 'wall'; }).length;
      }
    } catch (_) {}
    return 0;
  }

  // Calcule l'occupation en allant chercher les tables via l'API si nécessaire
  async function _refreshOccupation() {
    try {
      var tables = null;
      if (typeof Tables !== 'undefined' && Tables._getTables) tables = Tables._getTables();
      // Pas de cache local → fetch direct
      if (!tables || !tables.length) {
        var fresh = await API.getTables();
        if (Array.isArray(fresh)) tables = fresh;
      }
      if (!tables || !tables.length) {
        _setOccupation(0, 0);
        return;
      }
      // Filtrer murs
      tables = tables.filter(function(t) { return t.kind !== 'wall'; });
      // Compter occupées : soit via Tables._sessions, soit via le statut/sessions_table
      var openCount = 0;
      var sess = (typeof Tables !== 'undefined') && (Tables._getSessions ? Tables._getSessions() : Tables._sessions);
      if (sess && Object.keys(sess).length) {
        openCount = Object.keys(sess).length;
      } else {
        // Fallback : compte les tables qui ont une session_table.statut === 'ouverte'
        openCount = tables.filter(function(t) {
          if (t.statut === 'occupée' || t.statut === 'occupee') return true;
          var s = (t.sessions_table || []).find(function(x) { return x.statut === 'ouverte'; });
          return !!s;
        }).length;
      }
      _setOccupation(openCount, tables.length);
    } catch (e) {
      console.warn('[Dashboard] occupation', e);
      _setOccupation(0, 0);
    }
  }

  function _setOccupation(open, total) {
    var rate = total > 0 ? Math.round((open / total) * 100) : 0;
    var el = document.getElementById('dk-occupation');
    if (el) el.textContent = rate + '%';
    var fill = document.getElementById('dk-occupation-fill');
    if (fill) fill.style.width = rate + '%';
    // Sous-texte : "X / Y tables occupées"
    var sub = document.getElementById('dk-occupation-sub');
    if (sub) {
      if (total > 0) {
        sub.textContent = open + ' / ' + total + ' table' + (total > 1 ? 's' : '') + ' occupée' + (open > 1 ? 's' : '');
      } else {
        sub.textContent = 'Aucune table';
      }
    }
  }

  function _renderScore(value, stats) {
    var v = Math.max(0, Math.min(100, Math.round(value)));
    var valEl = document.getElementById('dash-score-val'); if (valEl) valEl.textContent = v;
    var arc = document.getElementById('dash-score-arc');
    if (arc) {
      var circ = 2 * Math.PI * 80;
      arc.setAttribute('stroke-dasharray', circ);
      arc.setAttribute('stroke-dashoffset', circ * (1 - v / 100));
    }
    var alertEl = document.getElementById('dash-score-alerts');
    var topEl   = document.getElementById('dash-score-top');
    if (alertEl) alertEl.textContent = stats.nb_alertes ?? ((stats.alertes||[]).length);
    if (topEl)   topEl.textContent = stats.top_produit || '—';
  }

  // ── Bar horizontal : ventes par produit ──────────────
  function _renderProductsBar(stats) {
    _destroy('products');
    const ctx = document.getElementById('chart-products-c');
    if (!ctx) return;
    const data = (stats.par_produit || []).slice(0, 7);
    if (!data.length) { _empty(ctx, 'Aucune vente — passe ta première commande'); return; }
    _restore(ctx);

    charts.products = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(p => p.nom),
        datasets: [{
          label: 'Quantité',
          data: data.map(p => p.qty),
          backgroundColor: '#0c2944',
          borderRadius: 6,
          maxBarThickness: 22,
        }],
      },
      options: _commonOpts({ indexAxis: 'y', plugins: { legend: { display: false } } }),
    });
  }

  // ── Doughnut : plats populaires ──────────────────────
  function _renderPopularDoughnut(stats) {
    _destroy('popular');
    const ctx = document.getElementById('chart-popular-c');
    if (!ctx) return;
    const data = (stats.par_produit || []).slice(0, 6);
    if (!data.length) { _empty(ctx, 'Aucune vente'); return; }
    _restore(ctx);

    charts.popular = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(p => p.nom),
        datasets: [{
          data: data.map(p => p.revenu || p.qty),
          backgroundColor: COLORS,
          borderWidth: 3,
          borderColor: _isDark() ? '#14171c' : '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { color: _txt(), font:{size:11}, boxWidth: 12, padding: 8 } },
          tooltip: { backgroundColor: 'rgba(17,17,17,.92)' },
        },
      },
    });
  }

  // ── Bar : catégories ─────────────────────────────────
  function _renderCategoriesBar(stats) {
    _destroy('categories');
    const ctx = document.getElementById('chart-categories-c');
    if (!ctx) return;
    const map = {};
    for (const p of (stats.par_produit || [])) {
      const cat = p.categorie || '—';
      map[cat] = (map[cat] || 0) + (p.revenu || p.qty);
    }
    const labels = Object.keys(map);
    if (!labels.length) { _empty(ctx, 'Aucune vente'); return; }
    _restore(ctx);

    charts.categories = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Revenu',
          data: labels.map(l => map[l]),
          backgroundColor: COLORS.slice(0, labels.length),
          borderRadius: 8,
          maxBarThickness: 50,
        }],
      },
      options: _commonOpts({ plugins: { legend: { display: false } } }),
    });
  }

  // ── Pie : Quantités vendues par produit (avec dégradés radiaux) ─────
  function _renderRadar(stats) {
    _destroy('pieProducts');
    const canvas = document.getElementById('chart-pie-products');
    if (!canvas) return;
    const data = (stats.par_produit || []).slice(0, 6);
    if (!data.length) { _empty(canvas, 'Aucune vente'); return; }
    _restore(canvas);

    // Palette harmonisée THE BOX — emerald primary + complémentaires modernes
    // Tailwind-inspired : tous saturés, même luminosité, harmonie cool/warm équilibrée
    const stops = THEBOX_PALETTE;

    // Création de dégradés radiaux par segment (Chart.js accepte un CanvasGradient)
    const c2d = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const r  = Math.min(cx, cy);
    const gradients = stops.slice(0, data.length).map(([light, dark]) => {
      const g = c2d.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      g.addColorStop(0, light);
      g.addColorStop(1, dark);
      return g;
    });
    const hoverGradients = stops.slice(0, data.length).map(([light, dark]) => {
      const g = c2d.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.05);
      g.addColorStop(0, _lighten(light, 8));
      g.addColorStop(1, dark);
      return g;
    });

    charts.pieProducts = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map(p => p.nom),
        datasets: [{
          data: data.map(p => p.qty),
          backgroundColor: gradients,
          hoverBackgroundColor: hoverGradients,
          borderColor: 'rgba(255,255,255,.85)',
          borderWidth: 3,
          borderRadius: 6,
          spacing: 2,
          hoverOffset: 12,
          hoverBorderColor: '#ffffff',
          hoverBorderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '38%',  // léger trou central pour un look donut moderne
        layout: { padding: 6 },
        animation: { animateRotate: true, animateScale: true, duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: _txt(),
              font: { size: 11, weight: '600' },
              padding: 14,
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 9,
              boxHeight: 9,
              generateLabels: function(chart) {
                // Légende personnalisée avec couleur du dégradé (extraction du stop foncé)
                const data = chart.data;
                return data.labels.map((label, i) => ({
                  text: label,
                  fillStyle: (stops[i] || stops[0])[1],
                  strokeStyle: (stops[i] || stops[0])[1],
                  lineWidth: 0,
                  hidden: false,
                  index: i,
                  pointStyle: 'circle',
                }));
              },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17,17,17,.94)',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 12, weight: '700' },
            bodyFont: { size: 12 },
            callbacks: {
              label: function(c) {
                const total = c.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total ? ((c.parsed / total) * 100).toFixed(1) : 0;
                return ' ' + c.parsed + ' vendus  •  ' + pct + '%';
              },
            },
          },
          datalabels: {
            display: true,
            color: '#fff',
            font: { weight: '700', size: 13, family: 'Inter, system-ui, sans-serif' },
            textShadowBlur: 6,
            textShadowColor: 'rgba(0,0,0,.35)',
            formatter: function(v, c) {
              const total = c.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total ? ((v / total) * 100) : 0;
              return pct >= 5 ? pct.toFixed(0) + '%' : '';
            },
          },
        },
      },
    });
  }

  // Helper : éclaircir une couleur hex de N % (utilisé pour hover)
  function _lighten(hex, percent) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    const p = percent / 100;
    const nr = Math.min(255, Math.round(r + (255 - r) * p));
    const ng = Math.min(255, Math.round(g + (255 - g) * p));
    const nb = Math.min(255, Math.round(b + (255 - b) * p));
    return '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // ── Bar : ventes par heure ──────────────────────────
  function _renderHoursBar(stats) {
    _destroy('hours');
    const ctx = document.getElementById('chart-hours-c');
    if (!ctx) return;
    const data = (stats.par_heure || []);
    if (!data.length) { _empty(ctx, 'Aucune vente'); return; }
    _restore(ctx);

    charts.hours = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(h => String(h.heure).padStart(2, '0') + 'h'),
        datasets: [{
          label: 'CA',
          data: data.map(h => parseFloat(h.ca || 0)),
          backgroundColor: '#6b7a5c',
          borderRadius: 5,
          maxBarThickness: 26,
        }],
      },
      options: _commonOpts({ plugins: { legend: { display: false } } }),
    });
  }

  // ── Line : évolution ─────────────────────────────────
  // ── Multi-courbes : CA par famille (Boisson Chaude / Froide / Cake / …) ──
  function _renderEvolutionMulti(payload) {
    _destroy('evolution');
    const canvas = document.getElementById('chart-evolution-c');
    if (!canvas) return;
    const dates = payload.dates || [];
    const families = payload.families || [];
    const series = payload.series || {};
    if (!dates.length) { _empty(canvas, 'Pas encore de données'); return; }
    _restore(canvas);

    // Palette par famille (couleurs modernes assorties au reste)
    // Définit { borderColor, gradientTopAlpha, gradientBottomAlpha }
    const famColors = {
      'Boisson Chaude': '#5c1a24',
      'Boisson Froide': '#6b7a5c',
      'Cake':           '#a8854e',
      'Coffee':         '#5c1a24',
      'Tea / Cold':     '#6b7a5c',
      'Snack':          '#a8854e',
    };
    const fallback = ['#5c1a24', '#6b7a5c', '#a8854e', '#b5683c', '#7a2230', '#c2540c', '#8a9a78'];

    const c2d = canvas.getContext('2d');
    const h = canvas.parentElement ? canvas.parentElement.offsetHeight : 240;

    const labels = dates.map(d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }));

    const datasets = families.map((fam, i) => {
      const color = famColors[fam] || fallback[i % fallback.length];
      const grad = c2d.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, _hexToRgba(color, .25));
      grad.addColorStop(1, _hexToRgba(color, 0));
      return {
        label: fam,
        data:  series[fam] || dates.map(() => 0),
        borderColor: color,
        backgroundColor: grad,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#fff',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2.8,
      };
    });

    // Ligne "Total" en pointillés gris doux (optionnel — si on a totals)
    if (Array.isArray(payload.totals)) {
      datasets.push({
        label: 'Total',
        data:  payload.totals,
        borderColor: 'rgba(120,120,120,.55)',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        borderWidth: 1.8,
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 99,
      });
    }

    charts.evolution = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: _commonOpts({
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top', align: 'end',
            labels: {
              color: _txt(), padding: 12, usePointStyle: true,
              pointStyle: 'circle', boxWidth: 9, boxHeight: 9,
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17,17,17,.94)',
            padding: 12, cornerRadius: 8,
            callbacks: {
              label: function(c) { return ' ' + c.dataset.label + ' : ' + c.parsed.y.toFixed(3) + ' DT'; },
            },
          },
          datalabels: { display: false },
        },
        scales: {
          x: { ticks: { color: _txt(), font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: _txt(), font: { size: 11 }, callback: v => v + ' DT' }, grid: { color: _grid() }, beginAtZero: true },
        },
        onClick: (e) => {
          const points = charts.evolution.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
          if (points.length) setDate(dates[points[0].index]);
        },
      }),
    });
  }

  function _hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0,2), 16);
    const g = parseInt(h.substr(2,2), 16);
    const b = parseInt(h.substr(4,2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function _renderEvolutionLine(data) {
    _destroy('evolution');
    const canvas = document.getElementById('chart-evolution-c');
    if (!canvas) return;
    if (!data.length) { _empty(canvas, 'Pas encore de données'); return; }
    _restore(canvas);

    const n = data.length;
    // Format labels selon la période :
    //  ≤ 8 jours    → "Lun 06" (jour court + numéro)
    //  ≤ 31 jours   → "06/06" (court date)
    //  ≤ 100 jours  → "06/06" mais 1 sur 7
    //  > 100 jours  → "Janv"  (mois)
    const fmtLabel = (dateStr, idx) => {
      const d = new Date(dateStr + 'T12:00:00');
      if (n <= 8)  return d.toLocaleDateString('fr-FR', { weekday:'short' }).replace('.', '') + ' ' + d.getDate();
      if (n <= 31) return d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0');
      if (n <= 100) {
        // 1 label tous les 7 jours
        return (idx % 7 === 0)
          ? d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0')
          : '';
      }
      // Année → labels mensuels
      const prev = idx > 0 ? new Date(data[idx - 1].date + 'T12:00:00') : null;
      if (!prev || prev.getMonth() !== d.getMonth()) {
        return d.toLocaleDateString('fr-FR', { month:'short' }).replace('.', '');
      }
      return '';
    };

    const labels = data.map((d, i) => fmtLabel(d.date, i));
    const vals   = data.map(d => parseFloat(d.ca || 0));

    const c2d = canvas.getContext('2d');
    const h = canvas.parentElement ? canvas.parentElement.offsetHeight : 260;

    // Gradient burgundy sous la courbe (assorti au thème primary)
    const grad = c2d.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,    'rgba(92, 26, 36, .26)');
    grad.addColorStop(0.55, 'rgba(92, 26, 36, .08)');
    grad.addColorStop(1,    'rgba(92, 26, 36, 0)');

    // Gradient sur le trait (burgundy clair → burgundy profond)
    const lineGrad = c2d.createLinearGradient(0, 0, canvas.width, 0);
    lineGrad.addColorStop(0,   '#9e5560');
    lineGrad.addColorStop(0.5, '#7a2230');
    lineGrad.addColorStop(1,   '#5c1a24');

    charts.evolution = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CA',
          data: vals,
          borderColor: lineGrad,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#5c1a24',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: n <= 8 ? 4 : 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#5c1a24',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 3,
          borderWidth: 2.8,
          borderCapStyle: 'round',
          borderJoinStyle: 'round',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18, right: 8, left: 4, bottom: 4 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 17, 17, .94)',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: { x: 12, y: 9 },
            cornerRadius: 8,
            displayColors: false,
            titleFont: { size: 11, weight: '600' },
            bodyFont:  { size: 14, weight: '700' },
            callbacks: {
              title: function(items) {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                return new Date(data[idx].date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
              },
              label: function(c) {
                const v = c.parsed.y;
                if (v >= 1000) return (v / 1000).toFixed(1).replace('.0', '') + 'K DT';
                return v.toFixed(0) + ' DT';
              },
            },
          },
          datalabels: { display: false },
        },
        scales: {
          x: {
            ticks: {
              color: _txt(),
              font: { size: 11, weight: '500' },
              padding: 6,
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
            },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: _txt(),
              font: { size: 10.5 },
              padding: 8,
              callback: v => v >= 1000 ? (v / 1000) + 'k' : v,
              maxTicksLimit: 6,
            },
            grid: { color: 'rgba(0,0,0,.05)', drawTicks: false },
            border: { display: false },
          },
        },
        onClick: (e) => {
          const points = charts.evolution.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
          if (points.length) setDate(data[points[0].index].date);
        },
      },
    });
  }

  // ── Empty state pour un canvas (NON destructif : ne supprime PAS le canvas) ─
  function _empty(canvas, msg) {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    // Détruire un chart Chart.js déjà attaché à ce canvas (sinon mémoire fuit)
    try {
      const inst = (window.Chart && Chart.getChart) ? Chart.getChart(canvas) : null;
      if (inst) inst.destroy();
    } catch (_) {}
    // Cacher le canvas, ajouter (ou raviver) un overlay .empty-state à côté
    canvas.style.display = 'none';
    let overlay = wrap.querySelector(':scope > .empty-state');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'empty-state';
      overlay.style.cssText = 'padding:40px 20px;text-align:center';
      wrap.appendChild(overlay);
    }
    overlay.innerHTML = '<div style="font-size:32px;opacity:.25;margin-bottom:8px">📊</div><div style="font-size:13px;color:var(--text-3)">' + msg + '</div>';
    overlay.style.display = '';
  }

  // Réinverse l'empty state : enlève l'overlay et restaure le canvas
  function _restore(canvas) {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (wrap) {
      const overlay = wrap.querySelector(':scope > .empty-state');
      if (overlay) overlay.remove();
    }
    canvas.style.display = '';
  }

  function _renderTopProductsTable(stats) {
    const tbody = document.getElementById('top-products-table');
    if (!tbody) return;
    const data = (stats.par_produit || []).slice(0, 8);
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-td">Aucune vente ce jour</td></tr>'; return; }
    tbody.innerHTML = data.map(p => `
      <tr>
        <td class="primary">${p.nom}</td>
        <td><span class="badge badge-neutral">${p.categorie || '—'}</span></td>
        <td class="mono">${p.qty}</td>
        <td class="accent">${parseFloat(p.revenu||0).toFixed(3)} DT</td>
      </tr>`).join('');
  }

  // ── Top produits en CARDS visuelles ──────────────────
  function _renderTopProductsCards(stats) {
    const el = document.getElementById('top-products-cards');
    if (!el) return;
    const data = (stats.par_produit || []).slice(0, 5);
    if (!data.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px 20px;text-align:center"><div style="font-size:32px;opacity:.25;margin-bottom:8px">📊</div><div style="font-size:13px;color:var(--text-3)">Aucune vente ce jour</div></div>';
      var total = document.getElementById('top-products-total');
      if (total) total.textContent = '0 vente';
      return;
    }
    var maxQty = Math.max.apply(null, data.map(function(p) { return p.qty; }));
    var totalQty = data.reduce(function(s,p){return s + (p.qty||0);}, 0);
    var totalEl = document.getElementById('top-products-total');
    if (totalEl) totalEl.textContent = totalQty + ' ventes';

    el.innerHTML = data.map(function(p, i) {
      var pct = maxQty > 0 ? (p.qty / maxQty) * 100 : 0;
      var revenu = parseFloat(p.revenu || 0).toFixed(3);
      // Image via ProductImages si dispo
      var prod = (typeof Store !== 'undefined' && Store.produits) ? Store.produits.find(function(x){return x.nom === p.nom;}) : null;
      var img = (typeof ProductImages !== 'undefined' && prod) ? ProductImages.render(prod) : { html: '☕', bg: '#efe6d3' };
      // Dégradés par rang — palette globale unifiée (emerald → cyan → indigo → violet → pink)
      var g = THEBOX_PALETTE[i % THEBOX_PALETTE.length];
      var rankClass = i === 0 ? ' dash-top-rank-1' : (i === 1 ? ' dash-top-rank-2' : (i === 2 ? ' dash-top-rank-3' : ''));
      return '<div class="dash-top-row" data-rank="' + (i+1) + '">'
           + '  <div class="dash-top-rank' + rankClass + '" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + (i + 1) + '</div>'
           + '  <div class="dash-top-img" style="background:' + img.bg + '">' + img.html + '</div>'
           + '  <div class="dash-top-info">'
           + '    <div class="dash-top-name">' + p.nom + '</div>'
           + '    <div class="dash-top-bar"><div class="dash-top-bar-fill" style="background:linear-gradient(90deg,' + g[0] + ',' + g[1] + ');width:' + pct + '%"></div></div>'
           + '  </div>'
           + '  <div class="dash-top-meta">'
           + '    <div class="dash-top-qty" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">' + p.qty + '×</div>'
           + '    <div class="dash-top-revenue">' + revenu + ' DT</div>'
           + '  </div>'
           + '</div>';
    }).join('');
  }

  // ── Heatmap horaire (style GitHub contributions) ──────
  function _renderHeatmap(stats) {
    const el = document.getElementById('dash-heatmap');
    if (!el) return;
    // par_heure peut être un ARRAY [{heure, nb, ca}, ...] ou un OBJECT { '08': 3, ... }
    var raw = stats.par_heure || [];
    // Normalise en map { 8: 3, 12: 8, ... }
    var byHour = {};
    if (Array.isArray(raw)) {
      raw.forEach(function(r) {
        var h = parseInt(r.heure != null ? r.heure : r.hour);
        var v = parseInt(r.nb != null ? r.nb : (r.count != null ? r.count : r.value || 0));
        if (!isNaN(h)) byHour[h] = v || 0;
      });
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function(k) {
        var h = parseInt(k);
        if (!isNaN(h)) byHour[h] = parseInt(raw[k]) || 0;
      });
    }

    // Liste des 24h (0h → 23h)
    var hours = [];
    var maxVol = 0;
    for (var h = 0; h <= 23; h++) {
      var v = byHour[h] || 0;
      hours.push({ hour: h, val: v });
      if (v > maxVol) maxVol = v;
    }

    // Niveau de chaleur 0-4 par rapport au max du jour
    function _lvl(v) {
      if (!maxVol || v === 0) return 0;
      var pct = v / maxVol;
      if (pct < 0.20) return 1;
      if (pct < 0.45) return 2;
      if (pct < 0.75) return 3;
      return 4;
    }

    el.innerHTML = hours.map(function(h) {
      var lvl = _lvl(h.val);
      var label = h.val > 0 ? h.val + ' cmd à ' + h.hour + 'h' : 'Aucune cmd à ' + h.hour + 'h';
      // Affichage : nombre si > 0, sinon juste le repère
      var valDisplay = h.val > 0 ? h.val : '·';
      return '<div class="hm-cell lvl-' + lvl + '" title="' + label + '">'
           + '  <span class="hm-cell-val">' + valDisplay + '</span>'
           + '  <span class="hm-cell-hour">' + h.hour + 'h</span>'
           + '</div>';
    }).join('');
  }

  function _renderStockGauges() {
    const el = document.getElementById('stock-gauges');
    if (!el) return;
    // Filtre : uniquement les produits avec tracking actif (pas tous les produits)
    const all = (typeof Store !== 'undefined' && Store.produits) || [];
    // ⚡ Store pas encore chargé ? On force le chargement et on re-render après
    if (typeof Store !== 'undefined' && !all.length && !Store._loaded.produits) {
      // Loading state pendant le fetch
      el.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';
      Store.loadProduits({ useCache: true }).finally(function() { _renderStockGauges(); });
      return;
    }
    const tracked = all.filter(p => p.tracked === true || (p.stock != null && !isNaN(p.stock)));
    // Badge compteur en haut
    const health = document.getElementById('stock-health-count');
    if (health) health.textContent = tracked.length + ' suivi' + (tracked.length > 1 ? 's' : '');

    if (!tracked.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px 20px;text-align:center">'
        + '<div style="font-size:32px;opacity:.25;margin-bottom:8px">📦</div>'
        + '<div style="font-size:13px;color:var(--text-3)">Aucun produit suivi en stock</div>'
        + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">Active le suivi dans la page Produits</div>'
        + '</div>';
      return;
    }
    // Trier : alertes en premier
    tracked.sort((a, b) => {
      const aStock = parseFloat(a.stock || 0), aSeuil = parseFloat(a.seuil || 5);
      const bStock = parseFloat(b.stock || 0), bSeuil = parseFloat(b.seuil || 5);
      const aBas = aStock < aSeuil, bBas = bStock < bSeuil;
      if (aBas !== bBas) return aBas ? -1 : 1;
      return aStock - bStock;
    });

    el.innerHTML = tracked.slice(0, 10).map(p => {
      const stock = parseFloat(p.stock || 0);
      const seuil = parseFloat(p.seuil || 5) || 1;
      const target = Math.max(seuil * 2, 1);
      const pct = Math.min(100, (stock / target) * 100).toFixed(0);
      const cls = stock <= 0 ? 'danger' : stock < seuil ? 'warn' : 'ok';
      const stockLabel = stock <= 0 ? 'Rupture' : (stock + (p.unite || 'u'));
      const dotIcon = stock <= 0 ? '!' : stock < seuil ? '↓' : '✓';
      return `<div class="gauge-row">
        <span class="gauge-dot ${cls}">${dotIcon}</span>
        <span class="gauge-label">${p.nom}</span>
        <div class="gauge-track"><div class="gauge-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="gauge-pct ${cls}">${stockLabel}</span>
      </div>`;
    }).join('');
  }

  async function _renderCommandes() {
    const tbody = document.getElementById('dash-commandes');
    if (!tbody) return;
    let cmds = null;
    try { cmds = await API.getStatsCmds(_date); } catch (_) {}
    if (!cmds || cmds.error || !cmds.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-td">Aucune commande ce jour</td></tr>';
      return;
    }
    tbody.innerHTML = cmds.slice(0, 12).map(c => {
      const tableLbl   = c.table_nom && c.table_nom !== '—'
        ? `<span class="cmd-table-chip">${c.table_nom}</span>`
        : '<span class="cmd-serveur-empty">—</span>';
      const serveurLbl = c.serveur ? _serveurChip(c.serveur) : '<span class="cmd-serveur-empty">—</span>';
      return `
      <tr>
        <td class="primary">#${c.id}</td>
        <td class="mono">${new Date(c.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</td>
        <td>${tableLbl}</td>
        <td>${serveurLbl}</td>
        <td class="accent">${parseFloat(c.total || 0).toFixed(3)} DT</td>
      </tr>`;
    }).join('');
  }

  // Pastille serveur — couleur synchronisée avec le bar chart Performance par serveur
  //   (même index dans la palette = même couleur partout)
  function _serveurChip(name) {
    const map = window._SERVER_COLOR_MAP || {};
    let idx = map[name];
    // Fallback : hash stable du nom si pas encore mappé (avant 1er _renderServers)
    if (idx == null) {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      idx = h % THEBOX_PALETTE.length;
    }
    const [c1, c2] = THEBOX_PALETTE[idx % THEBOX_PALETTE.length];
    const init = name.trim().charAt(0).toUpperCase() || '?';
    return `<span class="cmd-serveur-chip" style="background:linear-gradient(135deg,${c1},${c2})"><span class="cmd-serveur-avatar">${init}</span>${name}</span>`;
  }

  async function openZ() {
    const z = await API.zJour(_date);
    if (!z || z.error) { Toast.error((z && z.error) || 'Erreur'); return; }
    const html = `
      <div class="modal-overlay open" id="modal-z" onclick="if(event.target.id==='modal-z') document.getElementById('modal-z').remove()">
        <div class="modal" onclick="event.stopPropagation()">
          <h2 class="modal-title">Z du ${_date}</h2>
          <div class="z-grid">
            <div class="z-card"><div class="z-label">Total TTC</div><div class="z-val">${z.total_ttc.toFixed(3)} DT</div></div>
            <div class="z-card"><div class="z-label">Total HT</div><div class="z-val">${z.total_ht.toFixed(3)} DT</div></div>
            <div class="z-card"><div class="z-label">TVA (${z.tva_taux}%)</div><div class="z-val">${z.taxes.toFixed(3)} DT</div></div>
            <div class="z-card"><div class="z-label">Commandes</div><div class="z-val">${z.nb_commandes}</div></div>
            <div class="z-card"><div class="z-label">Panier moyen</div><div class="z-val">${z.panier_moyen.toFixed(3)} DT</div></div>
            <div class="z-card"><div class="z-label">Top produit</div><div class="z-val sm">${z.top_produit ? z.top_produit.nom : '—'}</div></div>
          </div>
          <div class="modal-actions">
            <a class="btn btn-secondary" href="${API.exportUrl('etats', _date, _date)}" target="_blank">⬇ CSV</a>
            <button class="btn btn-primary" onclick="document.getElementById('modal-z').remove()">Fermer</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function setDate(d) { _date = d; render(); }
  function prevDay()  { const d=new Date(_date); d.setDate(d.getDate()-1); setDate(d.toISOString().split('T')[0]); }
  function nextDay()  { const d=new Date(_date); d.setDate(d.getDate()+1); setDate(d.toISOString().split('T')[0]); }

  return { render, setDate, prevDay, nextDay, openZ };
})();
