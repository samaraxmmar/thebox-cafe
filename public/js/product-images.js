/* ══════════════════════════════════════════════════════
   THE BOX — Product images
   Système intelligent d'images pour les produits :
   1. Si product.image (URL) → utilisée
   2. Sinon → match par mot-clé du nom (espresso, latte, etc.)
   3. Sinon → emoji par catégorie sur fond crème
══════════════════════════════════════════════════════ */

var ProductImages = (function() {

  // Bibliothèque emoji par mot-clé (cherche dans le nom du produit)
  // L'emoji est rendu en gros sur fond crème — fonctionne sans aucun réseau.
  var KEYWORDS = [
  
    { match: /mocha|chocolat chaud/i,                   emoji: '🍫' },
    
    { match: /frapp[uo]ccino|frappé/i,                  emoji: '🥤' },
    { match: /iced coffee|café glacé|cold brew/i,       emoji: '🧊' },
    { match: /thé chaud|tea/i,                          emoji: '🍵' },
    { match: /thé glacé|ice tea/i,                      emoji: '🧊' },
    { match: /jus|orange|citron|fraise/i,               emoji: '🥤' },
    { match: /soda|coca|sprite|fanta|pepsi/i,           emoji: '🥤' },
    { match: /eau|water/i,                              emoji: '💧' },
    { match: /croissant|brioche|pain/i,                 emoji: '🥐' },
    { match: /cookie|biscuit/i,                         emoji: '🍪' },
    { match: /gâteau|cake|muffin/i,                     emoji: '🧁' },
    { match: /pizza/i,                                  emoji: '🍕' },
    { match: /sandwich|panini|tost/i,                   emoji: '🥪' },
    { match: /salade/i,                                 emoji: '🥗' },
  ];

  // Fond unifié — utilise la variable theme pour suivre light/dark mode
  // (transparent → laisse passer le background de la card)
  var UNIFIED_BG = 'transparent';
  var BG_BY_CAT = new Proxy({}, { get: function() { return UNIFIED_BG; } });

  /** Renvoie un objet { html, bg } prêt à insérer dans une card produit. */
  function render(produit) {
    if (!produit) return { html: '☕', bg: '#efe6d3' };
    var bg = BG_BY_CAT[produit.cat || produit.categorie] || '#efe6d3';

    // 1) Image URL fournie
    if (produit.image) {
      return {
        html: '<img src="' + produit.image + '" alt="" loading="lazy" '
            + 'onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{textContent:\'☕\',className:\'pi-emoji\'}))" />',
        bg: bg,
      };
    }

    // 2) Mot-clé dans le nom
    var name = produit.nom || '';
    for (var i = 0; i < KEYWORDS.length; i++) {
      if (KEYWORDS[i].match.test(name)) {
        return { html: '<div class="pi-emoji">' + KEYWORDS[i].emoji + '</div>', bg: bg };
      }
    }

    // 3) Fallback par catégorie
    var cat = produit.cat || produit.categorie || '';
    var fallback = '☕';
    if (/froid|tea|thé/i.test(cat))  fallback = '🥤';
    if (/patiss|snack|nourrit/i.test(cat)) fallback = '🥐';
    return { html: '<div class="pi-emoji">' + fallback + '</div>', bg: bg };
  }

  return { render: render };
})();
