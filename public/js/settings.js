/* ══════════════════════════════════════════════════════
   THE BOX — Page Paramètres (multi-onglets)
══════════════════════════════════════════════════════ */

var Settings = (function() {
  var _data = {};
  var _tab  = 'cafe';

  async function render() {
    await _load();
    _wireTabs();
    _renderPanel();
  }

  async function _load() {
    var d = await API.getSettings();
    _data = (d && !d.error) ? d : {};
  }

  function _wireTabs() {
    document.querySelectorAll('.settings-tab').forEach(function(b) {
      if (b._wired) return; b._wired = true;
      b.addEventListener('click', function() {
        _tab = b.getAttribute('data-tab');
        document.querySelectorAll('.settings-tab').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        _renderPanel();
      });
    });
  }

  function _section(title, sub, html) {
    return '<section class="settings-section"><div class="settings-section-head"><div class="settings-section-title">' + title + '</div>' +
      (sub ? '<div class="settings-section-sub">' + sub + '</div>' : '') + '</div>' +
      '<div class="settings-section-body">' + html + '</div></section>';
  }

  function _input(label, id, value, placeholder, type) {
    return '<div class="form-group"><label class="form-label">' + label + '</label>' +
           '<input class="form-input" type="' + (type || 'text') + '" id="' + id + '" value="' + (value == null ? '' : String(value).replace(/"/g, '&quot;')) + '" placeholder="' + (placeholder || '') + '"></div>';
  }

  function _checkbox(label, id, checked) {
    return '<div class="form-group"><label style="display:flex;gap:8px;align-items:center;font-size:13px">' +
           '<input type="checkbox" id="' + id + '" ' + (checked ? 'checked' : '') + '> ' + label + '</label></div>';
  }

  function _select(label, id, value, options) {
    var opts = options.map(function(o) {
      var v = typeof o === 'string' ? o : o.value;
      var l = typeof o === 'string' ? o : o.label;
      return '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + l + '</option>';
    }).join('');
    return '<div class="form-group"><label class="form-label">' + label + '</label>' +
           '<select class="form-input" id="' + id + '">' + opts + '</select></div>';
  }

  function _renderPanel() {
    var el = document.getElementById('settings-panel');
    if (!el) return;
    var s = _data;

    if (_tab === 'cafe') {
      var c = s.cafe || {};
      el.innerHTML = _section('Identité du café', 'Affichée sur les tickets et rapports',
        _input('Nom du café',  'set-cafe-nom',  c.nom)  +
        _input('Adresse',      'set-cafe-adr',  c.adresse) +
        _input('Téléphone',    'set-cafe-tel',  c.telephone) +
        _input('URL du logo',  'set-cafe-logo', c.logo_url));
      return;
    }

    if (_tab === 'pos') {
      var p = s.pos || {};
      el.innerHTML = _section('Configuration POS', 'Comportement de la caisse',
        _select('Devise', 'set-pos-devise', p.devise || 'DT', [
          { value: 'DT',  label: 'DT (Dinar tunisien)' },
          { value: 'EUR', label: 'EUR (Euro)' },
          { value: 'USD', label: 'USD (Dollar)' },
          { value: 'MAD', label: 'MAD (Dirham marocain)' },
        ]) +
        _select('Langue', 'set-pos-langue', p.langue || 'fr', [
          { value: 'fr', label: 'Français' },
          { value: 'en', label: 'English' },
          { value: 'ar', label: 'العربية' },
        ]) +
        _checkbox('Autoriser le stock négatif (vente même en rupture)', 'set-pos-neg', s.pos?.allowNegativeStock !== false));
      return;
    }

    if (_tab === 'taxes') {
      var px = s.pos || {};
      el.innerHTML = _section('Taxes & TVA', 'Appliquées sur les rapports HT/TTC',
        _input('Taux de TVA (%)', 'set-pos-tva',     px.tva || 0, '0', 'number') +
        _input('Service / pourboire (%)', 'set-pos-service', px.service || 0, '0', 'number'));
      return;
    }

    if (_tab === 'printer') {
      var pr = s.printer || {};
      el.innerHTML = _section('Imprimante ticket', 'Imprimante thermique ESC/POS',
        _checkbox('Impression auto à chaque vente', 'set-pr-auto', !!pr.activeAuto) +
        _input('Nom imprimante (Windows)', 'set-pr-name', pr.name) +
        _input('IP réseau',                'set-pr-ip',   pr.ip,   '192.168.1.50') +
        _input('Port',                     'set-pr-port', pr.port, '9100', 'number'));
      return;
    }

    if (_tab === 'whatsapp') {
      var w = s.whatsapp || {};
      el.innerHTML = _section('Notifications WhatsApp', 'Alertes stock et rapport quotidien',
        _input('Numéro destinataire (avec indicatif)', 'set-wa-num',   w.number,   '21612345678') +
        _checkbox('Alertes stock critique', 'set-wa-stock', !!w.alertes_stock) +
        _checkbox('Rapport quotidien à 22h', 'set-wa-rap',  !!w.rapport_quotidien) +
        '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" onclick="Settings.testWA()">📲 Envoyer un message test</button></div>');
      return;
    }

    if (_tab === 'supabase') {
      var sb = s.supabase || {};
      el.innerHTML = _section('Base de données Supabase', 'Modifie ces valeurs dans le fichier .env, puis redémarre',
        _input('SUPABASE_URL', 'set-sb-url', sb.url || '', 'https://xxx.supabase.co') +
        '<div class="form-group"><label class="form-label">SUPABASE_KEY</label>' +
        '<input class="form-input" type="password" placeholder="' + (sb.key_set ? '••• configurée •••' : 'non configurée') + '" disabled></div>' +
        '<div class="settings-hint">La clé Supabase n\'est jamais affichée. Pour la changer, modifie le fichier <code>.env</code> à la racine.</div>');
      return;
    }

    if (_tab === 'security') {
      var sec = s.security || {};
      el.innerHTML = _section('Sécurité & sessions', 'Politique de mots de passe et expiration de session',
        _input('Durée session (heures)',          'set-sec-ttl',  sec.session_ttl_hours || 12, '12', 'number') +
        _input('Blocage après N tentatives',      'set-sec-lock', sec.lockout_after_attempts || 5, '5', 'number') +
        _input('Longueur min. du PIN',            'set-sec-pin',  sec.min_pin_length || 4, '4', 'number'));
      return;
    }

    if (_tab === 'theme') {
      var current = (typeof Theme !== 'undefined' && Theme.current) ? Theme.current() : 'light';
      el.innerHTML = _section('Apparence', 'Thème de l\'interface',
        '<div style="display:flex;gap:10px">' +
          '<button class="btn ' + (current === 'light' ? 'btn-primary' : 'btn-secondary') + '" onclick="Theme.toggle()">' + (current === 'light' ? '☀ Mode clair' : '🌙 Mode sombre') + '</button>' +
          '<button class="btn btn-ghost" onclick="Theme.toggle()">Basculer</button>' +
        '</div>' +
        '<div class="settings-hint" style="margin-top:14px">Le thème est mémorisé dans le navigateur (localStorage) et appliqué à tous les modules.</div>');
      return;
    }

    if (_tab === 'backup') {
      el.innerHTML = _section('Sauvegarde & restauration', 'Export complet des utilisateurs, paramètres, mouvements et logs',
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<a class="btn btn-primary" href="' + API.backupUrl() + '" target="_blank">⬇ Télécharger une sauvegarde</a>' +
          '<button class="btn btn-secondary" onclick="document.getElementById(\'restore-file\').click()">⬆ Restaurer un fichier</button>' +
          '<input type="file" id="restore-file" accept="application/json" style="display:none" onchange="Settings._restoreFile(this)">' +
        '</div>' +
        '<div class="settings-hint" style="margin-top:14px">La restauration écrase utilisateurs, paramètres et historiques. Faire une sauvegarde avant.</div>');
      return;
    }

    if (_tab === 'logs') {
      el.innerHTML = _section('Logs système', 'Les 200 dernières entrées', '<div id="logs-list"></div>' +
        '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-ghost btn-sm" onclick="Settings._loadLogs()">↻ Rafraîchir</button>' +
        '<button class="btn btn-danger btn-sm" onclick="Settings._clearLogs()">Vider</button></div>');
      _loadLogs();
      return;
    }
  }

  async function _loadLogs() {
    var r = await API.getLogs(200);
    var html = '';
    if (Array.isArray(r) && r.length) {
      html = '<div class="logs-list">' + r.map(function(e) {
        var color = e.level === 'error' ? 'var(--red)' : (e.level === 'warn' ? 'var(--orange)' : 'var(--text2)');
        var ts = new Date(e.ts).toLocaleTimeString('fr-FR');
        return '<div class="log-line"><span class="log-ts">' + ts + '</span>' +
               '<span class="log-level" style="color:' + color + '">' + e.level.toUpperCase() + '</span>' +
               '<span class="log-msg">' + e.message + '</span></div>';
      }).join('') + '</div>';
    } else {
      html = '<div class="empty-state">Aucun log</div>';
    }
    var el = document.getElementById('logs-list');
    if (el) el.innerHTML = html;
  }

  async function _clearLogs() {
    if (!confirm('Vider les logs ?')) return;
    await API.clearLogs();
    _loadLogs();
  }

  function _restoreFile(input) {
    if (!input.files || !input.files[0]) return;
    var rdr = new FileReader();
    rdr.onload = async function() {
      try {
        var json = JSON.parse(rdr.result);
        if (!json.data) { Toast.error('Fichier invalide'); return; }
        if (!confirm('Restaurer cette sauvegarde ? (écrase utilisateurs, paramètres, etc.)')) return;
        var r = await API.restore(json.data);
        if (r && r.success) Toast.success('Sauvegarde restaurée'); else Toast.error((r && r.error) || 'Erreur');
      } catch (e) { Toast.error('Fichier invalide'); }
    };
    rdr.readAsText(input.files[0]);
  }

  function _collect() {
    var patch = {};
    if (_tab === 'cafe') {
      patch.cafe = {
        nom:       (document.getElementById('set-cafe-nom') || {}).value || '',
        adresse:   (document.getElementById('set-cafe-adr') || {}).value || '',
        telephone: (document.getElementById('set-cafe-tel') || {}).value || '',
        logo_url:  (document.getElementById('set-cafe-logo') || {}).value || '',
      };
    } else if (_tab === 'pos') {
      patch.pos = Object.assign({}, _data.pos || {}, {
        devise: (document.getElementById('set-pos-devise') || {}).value,
        langue: (document.getElementById('set-pos-langue') || {}).value,
        allowNegativeStock: !!(document.getElementById('set-pos-neg') || {}).checked,
      });
    } else if (_tab === 'taxes') {
      patch.pos = Object.assign({}, _data.pos || {}, {
        tva:     parseFloat((document.getElementById('set-pos-tva')     || {}).value) || 0,
        service: parseFloat((document.getElementById('set-pos-service') || {}).value) || 0,
      });
    } else if (_tab === 'printer') {
      patch.printer = {
        activeAuto: !!(document.getElementById('set-pr-auto') || {}).checked,
        name: (document.getElementById('set-pr-name') || {}).value,
        ip:   (document.getElementById('set-pr-ip')   || {}).value,
        port: parseInt((document.getElementById('set-pr-port') || {}).value) || 9100,
      };
    } else if (_tab === 'whatsapp') {
      patch.whatsapp = {
        number:            (document.getElementById('set-wa-num')   || {}).value || '',
        alertes_stock:     !!(document.getElementById('set-wa-stock') || {}).checked,
        rapport_quotidien: !!(document.getElementById('set-wa-rap')   || {}).checked,
      };
    } else if (_tab === 'security') {
      patch.security = {
        session_ttl_hours:      parseInt((document.getElementById('set-sec-ttl')  || {}).value) || 12,
        lockout_after_attempts: parseInt((document.getElementById('set-sec-lock') || {}).value) || 5,
        min_pin_length:         parseInt((document.getElementById('set-sec-pin')  || {}).value) || 4,
      };
    }
    return patch;
  }

  async function save() {
    var patch = _collect();
    if (!Object.keys(patch).length) { Toast.warn('Rien à enregistrer dans cet onglet'); return; }
    var r = await API.saveSettings(patch);
    if (r && !r.error) { Toast.success('Paramètres enregistrés'); _data = r; }
    else Toast.error((r && r.error) || 'Erreur');
  }

  function backup() { window.open(API.backupUrl(), '_blank'); }

  async function testWA() {
    var r = await API.testWA('🧪 Test depuis Paramètres');
    if (r && r.sent) Toast.success('Message envoyé'); else Toast.warn('WhatsApp non connecté');
  }

  return { render: render, save: save, backup: backup, testWA: testWA, _restoreFile: _restoreFile, _loadLogs: _loadLogs, _clearLogs: _clearLogs };
})();
