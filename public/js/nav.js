var Nav = {
  // page → permission requise
  _gates: {
    caisse:     'orders.create',
    tables:     'tables.view',
    dashboard:  'dashboard.view',
    commandes:  'orders.history',
    produits:   'products.view',
    stock:      'stock.view',
    users:      'users.manage',
    parametres: 'settings.view',
  },

  go: function(name) {
    var gate = this._gates[name];
    if (gate && !Auth.can(gate)) { Toast.warn('Permission refusée : ' + gate); return; }

    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');

    var navs = document.querySelectorAll('.nav-item');
    for (var j = 0; j < navs.length; j++) navs[j].classList.remove('active');

    var pageEl = document.getElementById('page-' + name);
    if (!pageEl) { console.warn('Nav: page introuvable', name); return; }
    pageEl.classList.add('active');
    var navEl = document.querySelector('.nav-item[data-page="' + name + '"]');
    if (navEl) navEl.classList.add('active');

    var main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;

    try {
      if (name === 'caisse'     && typeof Caisse     !== 'undefined') Caisse.render();
      if (name === 'dashboard'  && typeof Dashboard  !== 'undefined') Dashboard.render();
      if (name === 'stock'      && typeof Stock      !== 'undefined') Stock.render();
      if (name === 'commandes'  && typeof Commandes  !== 'undefined') Commandes.render();
      if (name === 'tables'     && typeof Tables     !== 'undefined') Tables.render();
      if (name === 'produits'   && typeof Produits   !== 'undefined') Produits.render();
      if (name === 'users'      && typeof Users      !== 'undefined') Users.render();
      if (name === 'parametres' && typeof Settings   !== 'undefined') Settings.render();
    } catch (e) { console.error('Nav render', e); }
  }
};
