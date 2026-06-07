# THE BOX — Guide rapide

> Café & Gestion · Sfax · Version 3.1

## 🚀 Démarrer l'application

1. **Double-clic** sur `start.bat` (sur le bureau)
2. Une fenêtre noire s'ouvre — **ne pas la fermer** tant que tu utilises le café
3. Ouvrir **Chrome** → `http://localhost:3001`

> 💡 Si le PC est éteint, redémarre simplement et lance `start.bat`.

---

## 🔑 Se connecter

| Rôle | Identifiant | PIN par défaut |
|------|-------------|----------------|
| Administrateur | `admin` | `1234` |
| Manager | `manager` | `2222` |
| Caissier | `caisse` | `1111` |
| Serveur | `serveur` | `0000` |

⚠ **Important** : à la 1ère utilisation, va dans **Utilisateurs** → modifie tous les PINs.

---

## ☕ Prendre une commande (parcours serveur)

1. **Tables** → clique une table libre (verte) → "Ouvrir" → saisis le nombre de couverts
2. La table passe en orange "Occupée"
3. **Caisse** → le badge "Table X" s'affiche en haut à droite
4. Clique sur les produits → ils s'ajoutent au panier
5. Pour ajouter plus d'unités : bouton **+** sur la ligne du produit
6. Quitter et revenir sur la table garde le panier mémorisé
7. Quand le client paie → **💳 Valider & encaisser** → ticket s'affiche
8. La table redevient automatiquement libre ✅

---

## 📦 Gérer le stock

### Créer un produit
- **Produits** → **+ Nouveau produit**
- Nom, prix, catégorie
- **Stock initial = 0** → produit **sans gestion de stock** (café, thé fait sur place)
- **Stock initial > 0** → produit **suivi** (Soda, Eau, Croissant — qui se décrémentent à la vente)

### Réapprovisionner
- **Stock** → bouton "Réapprovisionner" sur le produit → saisir la quantité ajoutée

### Alerte rupture
- Si stock < seuil → notification **WhatsApp** envoyée au gérant automatiquement
- Le produit affiche **⚠ Rupture** en caisse, mais reste **vendable** (jamais bloqué)

---

## 📊 Consulter les rapports

- **Dashboard** : CA du jour, top produit, alertes, courbes — temps réel
- Bouton **📋 Z caisse** → résumé HT/TTC/TVA imprimable
- Bouton **📄 PDF** → rapport téléchargeable du jour sélectionné
- Bouton **⬇ CSV** → export Excel des ventes

---

## 🛟 En cas de problème

| Symptôme | Solution |
|---|---|
| Le navigateur dit "site inaccessible" | Vérifier que la fenêtre noire (`start.bat`) est ouverte |
| Une table reste bloquée "Occupée" | Cliquer la table → **Clôturer** (manuellement) |
| WhatsApp ne reçoit plus d'alertes | Redémarrer `start.bat`, re-scanner QR si demandé |
| Lenteur soudaine | Fermer/rouvrir l'onglet Chrome (Ctrl+Shift+R) |
| Mot de passe oublié | Login en admin → Utilisateurs → réinitialise le PIN |

**Support technique** : [ton email/téléphone]
