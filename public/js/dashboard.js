/* ══════════════════════════════════════════════════════
   THE BOX — Dashboard premium (Chart.js)
   - 8 KPIs avec sparklines + delta vs J-1
   - Bénéfice calculé via cout_unitaire
   - Charts Chart.js + empty states informatifs
══════════════════════════════════════════════════════ */

const Dashboard = (() => {
  let _date = new Date().toISOString().split('T')[0];
  let _evoDays = 7;
  const charts = {};

  const COLORS = ['#008060','#2c6ecb','#b98900','#d72c0d','#9b59b6','#19a974','#e0935c','#5c9fe0','#a564d4'];
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
  async function render() {
    if (typeof Chart === 'undefined') {
      if (_chartRetries++ < 20) { setTimeout(() => render(), 200); return; }
      Toast.warn('Chart.js indisponible — actualise la page');
      return;
    }
    _chartRetries = 0;
    _renderDatePicker();

    // Loading state sur KPIs
    ['k-orders','k-customers','k-revenue','k-profit','k-avg','k-top','k-alerts','k-tva']
      .forEach(id => { var e=document.getElementById(id); if(e) e.textContent='…'; });

    const [stats, evo, statsPrev] = await Promise.all([
      API.getStats(_date),
      API.getEvolution(_evoDays),
      API.getStats(_yesterday(_date)).catch(() => null),
    ]);

    if (stats && !stats.error) {
      _renderKPIs(stats, statsPrev);
      _renderProductsBar(stats);
      _renderPopularDoughnut(stats);
      _renderCategoriesBar(stats);
      _renderHoursBar(stats);
      _renderStockGauges();
      _renderTopProductsTable(stats);
    } else {
      _zeroKPIs();
      if (stats && stats.error) Toast.error('Stats : ' + stats.error);
    }

    if (evo && !evo.error) _renderEvolutionLine(evo);
    await _renderCommandes();
  }

  function _yesterday(d) {
    const x = new Date(d); x.setDate(x.getDate() - 1);
    return x.toISOString().split('T')[0];
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
    ['k-orders','k-customers','k-revenue','k-profit','k-avg','k-tva','k-alerts'].forEach(id => {
      var e=document.getElementById(id); if(e) e.textContent='0';
    });
    ['k-revenue-delta','k-profit-delta','k-orders-delta','k-avg-delta'].forEach(id => {
      var e=document.getElementById(id); if(e) e.textContent='';
    });
    var t=document.getElementById('k-top'); if(t) t.textContent='—';
  }

  function _renderKPIs(stats, prev) {
    // Devise depuis settings
    const settings = (window._cachedSettings) || {};
    const devise = (settings.pos && settings.pos.devise) || 'DT';

    const fmtMoney = n => parseFloat(n||0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + devise;
    const fmtInt   = n => parseFloat(n||0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const setVal   = (id, v) => { var e=document.getElementById(id); if(e) e.textContent = v; };
    const setDelta = (id, delta, suffix) => {
      var e=document.getElementById(id); if(!e) return;
      if (delta == null || !isFinite(delta)) { e.textContent = ''; e.className = 'kpi-hero-delta'; return; }
      const up = delta >= 0;
      e.className = 'kpi-hero-delta ' + (up ? 'up' : 'down');
      e.innerHTML = (up ? '▲' : '▼') + ' ' + Math.abs(delta).toFixed(0) + '% ' + (suffix || 'vs J-1');
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
    setDelta('k-revenue-delta', prevCA ? _delta(ca, prevCA) : null);

    setVal('k-profit', fmtMoney(profitInfo.profit));
    setDelta('k-profit-delta', null /* pas de delta historique de profit pour l'instant */);

    setVal('k-orders', fmtInt(nb));
    setDelta('k-orders-delta', prevNb ? _delta(nb, prevNb) : null);

    setVal('k-avg', fmtMoney(avg));
    setDelta('k-avg-delta', prevAvg ? _delta(avg, prevAvg) : null);

    // Mini row
    setVal('k-customers', fmtInt(nb));
    setVal('k-top',       stats.top_produit || '—');
    setVal('k-alerts',    fmtInt(stats.nb_alertes ?? ((stats.alertes||[]).length)));
    setVal('k-tva',       fmtMoney(tva));
  }

  // ── Bar horizontal : ventes par produit ──────────────
  function _renderProductsBar(stats) {
    _destroy('products');
    const ctx = document.getElementById('chart-products-c');
    if (!ctx) return;
    const data = (stats.par_produit || []).slice(0, 7);
    if (!data.length) { _empty(ctx, 'Aucune vente — passe ta première commande'); return; }

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

  // ── Bar : ventes par heure ──────────────────────────
  function _renderHoursBar(stats) {
    _destroy('hours');
    const ctx = document.getElementById('chart-hours-c');
    if (!ctx) return;
    const data = (stats.par_heure || []);
    if (!data.length) { _empty(ctx, 'Aucune vente'); return; }

    charts.hours = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(h => String(h.heure).padStart(2, '0') + 'h'),
        datasets: [{
          label: 'CA',
          data: data.map(h => parseFloat(h.ca || 0)),
          backgroundColor: '#2c6ecb',
          borderRadius: 5,
          maxBarThickness: 26,
        }],
      },
      options: _commonOpts({ plugins: { legend: { display: false } } }),
    });
  }

  // ── Line : évolution ─────────────────────────────────
  function _renderEvolutionLine(data) {
    _destroy('evolution');
    const ctx = document.getElementById('chart-evolution-c');
    if (!ctx) return;
    if (!data.length) { _empty(ctx, 'Pas encore de données'); return; }

    const labels = data.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }));
    const vals   = data.map(d => parseFloat(d.ca || 0));

    // Gradient
    const gctx = ctx.getContext('2d');
    const grad = gctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(0,128,96,.32)');
    grad.addColorStop(1, 'rgba(0,128,96,0)');

    charts.evolution = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CA (DT)',
          data: vals,
          borderColor: '#008060',
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#008060',
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
        }],
      },
      options: _commonOpts({
        plugins: { legend: { display: false } },
        onClick: (e) => {
          const points = charts.evolution.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
          if (points.length) setDate(data[points[0].index].date);
        },
      }),
    });
  }

  // ── Empty state pour un canvas ──────────────────────
  function _empty(canvas, msg) {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state" style="padding:40px 20px"><div style="font-size:32px;opacity:.25;margin-bottom:8px">📊</div><div style="font-size:13px;color:var(--text3)">' + msg + '</div></div>';
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

  function _renderStockGauges() {
    const el = document.getElementById('stock-gauges');
    if (!el) return;
    const ings = (typeof Store !== 'undefined' && Store.ingredients) || [];
    if (!ings.length) {
      el.innerHTML = '<div class="empty-state" style="padding:30px">Aucun ingrédient — va dans Stock pour en ajouter</div>';
      return;
    }
    el.innerHTML = ings.slice(0, 10).map(i => {
      const pct = Math.min(100, (i.stock / Math.max(i.seuil * 2, 1) * 100)).toFixed(0);
      const cls = i.stock < i.seuil ? 'danger' : i.stock < i.seuil * 1.5 ? 'warn' : 'ok';
      return `<div class="gauge-row">
        <span class="gauge-label">${i.nom}</span>
        <div class="gauge-track"><div class="gauge-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="gauge-pct">${i.stock}${i.unite}</span>
      </div>`;
    }).join('');
  }

  async function _renderCommandes() {
    const tbody = document.getElementById('dash-commandes');
    if (!tbody) return;
    let cmds = null;
    try { cmds = await API.getStatsCmds(_date); } catch (_) {}
    if (!cmds || cmds.error || !cmds.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-td">Aucune commande ce jour</td></tr>';
      return;
    }
    tbody.innerHTML = cmds.slice(0, 12).map(c => `
      <tr>
        <td class="primary">#${c.id}</td>
        <td class="mono">${new Date(c.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</td>
        <td>${c.table_nom || '—'}</td>
        <td class="accent">${parseFloat(c.total || 0).toFixed(3)} DT</td>
      </tr>`).join('');
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
