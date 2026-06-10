/* ══════════════════════════════════════════════════════
   THE BOX — Page Commandes
══════════════════════════════════════════════════════ */

const Commandes = {
  _allCmds: [],
  _currentDate: '',
  _actionsWired: false,

  async render() {
    const tbody = document.getElementById('commandes-table');
    tbody.innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spinner"></div>Chargement...</div></td></tr>';

    const cmds = await API.getCommandes();
    this._allCmds = cmds || [];

    // Peupler le filtre de dates
    const dateSelect = document.getElementById('commandes-date');
    if (dateSelect) {
      const dates = [...new Set((this._allCmds).map(c => c.created_at.split('T')[0]))].sort().reverse();
      dateSelect.innerHTML = '<option value="">Toutes les dates</option>' +
        dates.map(d => `<option value="${d}">${new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })}</option>`).join('');
    }

    this._renderActions();
    this._renderRows(this._allCmds);
  },

  _renderActions() {
    const wrap = document.querySelector('#page-commandes .topbar-right');
    if (!wrap) return;
    const canDelete = Auth.can('orders.delete');
    // On insère le bouton à la suite du select date, une seule fois
    if (!document.getElementById('commandes-delete-btn') && canDelete) {
      const btn = document.createElement('button');
      btn.id = 'commandes-delete-btn';
      btn.className = 'btn btn-danger btn-sm';
      btn.style.cssText = 'display:none;margin-left:8px';
      btn.innerHTML = '🗑 Supprimer cette journée';
      btn.onclick = () => this.openDeleteByDate();
      wrap.appendChild(btn);
    }
    this._refreshDeleteBtn();
  },

  _refreshDeleteBtn() {
    const btn = document.getElementById('commandes-delete-btn');
    if (!btn) return;
    btn.style.display = this._currentDate ? 'inline-flex' : 'none';
  },

  filterDate(value) {
    this._currentDate = value || '';
    this._refreshDeleteBtn();
    const filtered = value
      ? this._allCmds.filter(c => c.created_at.startsWith(value))
      : this._allCmds;
    this._renderRows(filtered);
  },

  _renderRows(cmds) {
    const tbody = document.getElementById('commandes-table');
    const canDelete = Auth.can('orders.delete');
    if (!cmds || !cmds.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:24px">Aucune commande enregistrée</td></tr>';
      return;
    }
    tbody.innerHTML = cmds.map(c => {
      const tableNom = c.table_nom || '—';
      const serveur  = c.serveur ? this._serveurBadge(c.serveur) : '<span class="cmd-serveur-empty">—</span>';
      return `
      <tr>
        <td class="primary">#${c.id}</td>
        <td>${new Date(c.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
        <td>${tableNom !== '—' ? '<span class="cmd-table-chip">'+tableNom+'</span>' : '<span class="cmd-serveur-empty">—</span>'}</td>
        <td>${serveur}</td>
        <td>${(c.commande_items || []).map(i => i.quantite + '× ' + (i.produits?.nom || '?')).join(', ')}</td>
        <td class="accent">${parseFloat(c.total).toFixed(3)} DT</td>
        <td><span class="badge ${c.statut === 'annulee' ? 'badge-red' : 'badge-green'}">${c.statut}</span></td>
        <td class="actions">
          ${canDelete ? `<button class="btn btn-danger btn-xs" onclick="Commandes.deleteOne(${c.id})" title="Supprimer">🗑</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  },

  /** Pastille serveur — couleur synchronisée avec le bar chart du dashboard
   *  (même index dans la palette → même couleur partout) */
  _serveurBadge(name) {
    const palette = (typeof THEBOX_PALETTE !== 'undefined') ? THEBOX_PALETTE : [
      ['#9e5560', '#5c1a24'], ['#d8b985', '#a8854e'], ['#8a9a78', '#566348'],
      ['#d99873', '#b5683c'], ['#a06b72', '#7a2230'], ['#e0b066', '#b5772e'],
    ];
    const map = window._SERVER_COLOR_MAP || {};
    let idx = map[name];
    if (idx == null) {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      idx = h % palette.length;
    }
    const [c1, c2] = palette[idx % palette.length];
    const init = name.trim().charAt(0).toUpperCase() || '?';
    return `<span class="cmd-serveur-chip" style="background:linear-gradient(135deg,${c1},${c2})"><span class="cmd-serveur-avatar">${init}</span>${name}</span>`;
  },

  /** Supprimer une commande seule (depuis ligne tableau) */
  async deleteOne(id) {
    if (!Auth.can('orders.delete')) { Toast.warn('Permission refusée'); return; }
    if (!confirm('Supprimer la commande #' + id + ' ?\n\nCette action est irréversible.')) return;
    const r = await API.deleteCommande(id);
    if (r && r.success) {
      Toast.success('Commande #' + id + ' supprimée');
      this.render();
    } else {
      Toast.error((r && r.error) || 'Erreur');
    }
  },

  /** Modale "supprimer cette journée" avec preview du nombre + total */
  async openDeleteByDate() {
    if (!this._currentDate) { Toast.warn('Sélectionne une date d\'abord'); return; }
    if (!Auth.can('orders.delete')) { Toast.warn('Permission refusée'); return; }

    // Preview : combien de commandes + total
    const preview = await API.previewDeleteByDate(this._currentDate);
    if (!preview || preview.error) {
      Toast.error((preview && preview.error) || 'Aperçu impossible');
      return;
    }
    if (!preview.count) {
      Toast.warn('Aucune commande à supprimer pour cette date');
      return;
    }

    const dateLbl = new Date(this._currentDate + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
    });

    // Construire la modale dynamiquement
    const existing = document.getElementById('modal-delete-date');
    if (existing) existing.remove();
    const html = `
      <div class="modal-overlay open" id="modal-delete-date" onclick="if(event.target.id==='modal-delete-date') document.getElementById('modal-delete-date').remove()">
        <div class="modal modal-sm" onclick="event.stopPropagation()">
          <h2 class="modal-title" style="color:var(--danger)">⚠ Supprimer les commandes</h2>
          <div style="font-size:14px;color:var(--text);margin-bottom:14px">
            Tu es sur le point de supprimer <strong>définitivement</strong> :
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text-2)">Date</span>
              <strong>${dateLbl}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:var(--text-2)">Commandes</span>
              <strong>${preview.count}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-2)">Total cumulé</span>
              <strong style="color:var(--primary)">${parseFloat(preview.total).toFixed(3)} DT</strong>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-3);background:var(--danger-bg);border:1px solid rgba(225,102,96,.25);border-radius:10px;padding:10px 12px;margin-bottom:14px">
            ⚠ <strong>Action irréversible.</strong> Les commandes et leurs lignes de détail seront effacées de la base. Le stock <strong>NE sera PAS</strong> restauré.
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-secondary" onclick="document.getElementById('modal-delete-date').remove()">Annuler</button>
            <button class="btn btn-danger" id="confirm-delete-date">🗑 Confirmer la suppression</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('confirm-delete-date').onclick = async () => {
      const btn = document.getElementById('confirm-delete-date');
      btn.disabled = true; btn.textContent = 'Suppression...';
      const r = await API.deleteByDate(this._currentDate);
      const m = document.getElementById('modal-delete-date'); if (m) m.remove();
      if (r && r.success) {
        Toast.success(r.deleted + ' commande(s) supprimée(s) — ' + parseFloat(r.total || 0).toFixed(3) + ' DT effacés');
        this._currentDate = '';
        const ds = document.getElementById('commandes-date'); if (ds) ds.value = '';
        await this.render();
      } else {
        Toast.error((r && r.error) || 'Erreur de suppression');
      }
    };
  },
};
