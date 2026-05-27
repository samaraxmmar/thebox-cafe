/* ══════════════════════════════════════════════════════
   THE BOX — Commandes page
══════════════════════════════════════════════════════ */

const Commandes = {
  _allCmds: [],

  async render() {
    const tbody = document.getElementById('commandes-table');
    tbody.innerHTML = '<tr><td colspan="6"><div class="loading"><div class="spinner"></div>Chargement...</div></td></tr>';

    const cmds = await API.getCommandes();
    this._allCmds = cmds || [];

    // Peupler le filtre de dates
    const dateSelect = document.getElementById('commandes-date');
    if (dateSelect) {
      const dates = [...new Set((this._allCmds).map(c => c.created_at.split('T')[0]))].sort().reverse();
      dateSelect.innerHTML = '<option value="">Toutes les dates</option>' +
        dates.map(d => `<option value="${d}">${new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })}</option>`).join('');
    }

    this._renderRows(this._allCmds);
  },

  filterDate(value) {
    const filtered = value
      ? this._allCmds.filter(c => c.created_at.startsWith(value))
      : this._allCmds;
    this._renderRows(filtered);
  },

  _renderRows(cmds) {
    const tbody = document.getElementById('commandes-table');
    if (!cmds || !cmds.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Aucune commande enregistrée</td></tr>';
      return;
    }
    tbody.innerHTML = cmds.map(c => `
      <tr>
        <td class="primary">#${c.id}</td>
        <td>${new Date(c.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
        <td>—</td>
        <td>${(c.commande_items || []).map(i => i.quantite + '× ' + (i.produits?.nom || '?')).join(', ')}</td>
        <td class="accent">${parseFloat(c.total).toFixed(3)} DT</td>
        <td><span class="badge badge-green">${c.statut}</span></td>
      </tr>`).join('');
  },
};