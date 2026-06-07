# THE BOX — Plan de tests QA avant livraison

> Tests à exécuter manuellement dans cet ordre. Coche `[x]` ce qui passe.
> Lance d'abord le smoke-test automatique : `npm run smoke`

---

## 1. Scénarios critiques (parcours bout-en-bout)

### 1.1 Parcours nominal — service complet
- [ ] Login `admin` / `1234` → arrive sur Caisse
- [ ] Aller sur **Tables** → cliquer **Table 1** → "Ouvrir" (2 couverts)
- [ ] La table 1 passe en **vert/orange "Occupée"**
- [ ] Sur Caisse, badge "Table 1" apparaît en haut à droite
- [ ] Ajouter **Espresso** (×1) puis **Café au lait** (×1)
- [ ] Total = 4.000 DT (1.500 + 2.500)
- [ ] Cliquer sur **Tables** → retour → re-cliquer Table 1 → "Commander"
- [ ] **Vérifier que Espresso + Café au lait sont toujours là** (panier persisté côté table)
- [ ] Ajouter **Frappuccino** (×1) → Total = 9.000 DT
- [ ] Cliquer **Valider & encaisser**
- [ ] ✅ Reçu s'affiche avec 3 lignes et total exact
- [ ] ✅ Table 1 redevient **libre** automatiquement
- [ ] Aller sur **Commandes** → la vente apparaît en haut
- [ ] Aller sur **Stock** → si Espresso est suivi, son stock a baissé de 1

### 1.2 Stock négatif autorisé
- [ ] Créer un produit "Test rupture" stock 1
- [ ] Ouvrir Table 2 → ajouter Test rupture ×5
- [ ] **Doit s'ajouter** sans erreur (warning ⚠ rupture dans la console autorisé)
- [ ] Valider → commande passe, stock = -4

### 1.3 Auto-clôture
- [ ] Ouvrir Table 3 → 1 produit → Valider
- [ ] Table 3 retourne libre immédiatement après validation
- [ ] L'écran caisse efface le badge "Table 3"

---

## 2. Cas limites (edge cases)

| # | Test | Résultat attendu |
|---|---|---|
| 2.1 | PIN incorrect 3 fois | Login échoue, message "PIN incorrect" |
| 2.2 | PIN incorrect 20+ fois en 1 min | HTTP 429, "Trop de requêtes" |
| 2.3 | Stock à 0 → vente | ⚠ Toast "rupture" mais commande créée |
| 2.4 | Stock négatif → vente | Identique 2.3, jamais bloqué |
| 2.5 | Table déjà occupée → ouvrir | Erreur "Déjà ouverte" |
| 2.6 | Transfert Table 1 → Table 2 (vide) | Session déplacée, T1 libre, T2 occupée |
| 2.7 | Transfert vers table occupée | Erreur "Table cible déjà occupée" |
| 2.8 | Clôture table sans commande | Total 0.000 DT, table libérée |
| 2.9 | Double-clic rapide sur Valider | 1 SEULE commande créée (bouton disabled pendant l'envoi) |
| 2.10 | Refresh navigateur pendant un panier | Panier conservé (localStorage par table) |
| 2.11 | Quitter le navigateur, revenir | Session conservée 12h (cookie), tables persistées |
| 2.12 | Server Node redémarre pendant service | Tables ouvertes persistées (data/tables_sessions.json) |
| 2.13 | Supabase coupé pendant vente | Erreur claire, pas de crash serveur |
| 2.14 | Ajouter produit avec nom vide | Refusé "nom requis" |
| 2.15 | Quantité 99999 sur 1 ligne | Acceptée jusqu'à 10 000, sinon refusée |

---

## 3. Responsive

### 3.1 Tablette serveur (1024×768, portrait possible)
- [ ] Sidebar réduite (icônes uniquement) à < 1024px
- [ ] Caisse : panier reste accessible
- [ ] Boutons +/- assez gros pour le doigt (min 36px)
- [ ] Modale "Ouvrir table" lisible

### 3.2 Caisse principale (1366×768 ou 1920×1080)
- [ ] Layout 2 colonnes (produits | panier 380px)
- [ ] Aucun scroll horizontal
- [ ] Dashboard : 4 cartes héros + grille charts 3 colonnes
- [ ] Page Produits : sections par catégorie en grille

### 3.3 Petit écran (mobile, < 700px)
- [ ] Caisse passe en 1 colonne
- [ ] Panier en bas, sticky
- [ ] KPIs dashboard en grille 2×4

---

## 4. Permissions par rôle (test à 4 logins)

> Logout puis login successivement avec chaque compte.

### Admin (`admin` / `1234`)
- [ ] Voit **toutes** les pages dans la sidebar
- [ ] Bouton 🗑 visible sur les produits
- [ ] `+ Ajouter` / `Reset` visibles sur Tables
- [ ] Bouton `−` visible dans le panier caisse

### Manager (`manager` / `2222`)
- [ ] Voit Dashboard, Tables, Caisse, Commandes, Produits, Stock, Paramètres
- [ ] **PAS** Utilisateurs
- [ ] `+ Ajouter` / `Reset` Tables visibles
- [ ] Bouton `−` visible

### Caissier (`caisse` / `1111`)
- [ ] Voit Caisse, Tables, Dashboard, Commandes, Produits, Stock
- [ ] **PAS** Utilisateurs ni Paramètres
- [ ] `+ Ajouter` / `Reset` Tables **CACHÉS**
- [ ] Bouton `−` visible

### Serveur (`serveur` / `0000`)  ⚠ contrairement au prompt générique
- [ ] Voit Caisse + **Tables** (il en a besoin)
- [ ] **PAS** Dashboard, Commandes, Stock, Utilisateurs, Paramètres
- [ ] `+ Ajouter` / `Reset` Tables **CACHÉS**
- [ ] Bouton `−` **CACHÉ** dans le panier
- [ ] Peut uniquement faire `+` (ajouter unité)

---

## 5. WhatsApp (si `WHATSAPP_NUMBER` défini)

- [ ] Au démarrage : QR code dans la console (1ère fois)
- [ ] Scanner avec WhatsApp → message "✅ The Box démarré" reçu
- [ ] Forcer un stock bas (réappro inversé : passer un produit suivi de 10 à 2 avec seuil 5)
- [ ] Faire une vente qui décrémente → alerte WhatsApp envoyée
- [ ] Cron 22h : rapport quotidien (peut être déclenché manuellement via Paramètres → WhatsApp → test)

---

## 6. PDF Rapport

- [ ] Dashboard → bouton **📄 PDF** → fichier téléchargé
- [ ] PDF affiche : date, CA, nb commandes, top produit, alertes
- [ ] Pas de crash si aucune commande ce jour
- [ ] Test avec client qui ferme l'onglet pendant la génération → pas de crash serveur (protection `ERR_STREAM_WRITE_AFTER_END`)

---

## 7. Performance

- [ ] Premier login → page interactive en < 2s
- [ ] Refresh suivant → cache → < 500ms
- [ ] Ajout produit → carte apparaît sans recharger toute la liste (animation flash vert)
- [ ] Suppression produit → carte disparaît instantanément
- [ ] Navigation entre pages → fluide, pas de spinner long

---

## Outils

```powershell
# Smoke test automatique (lance le serveur dans un autre terminal d'abord)
npm run smoke

# Vérifier les logs serveur
type data\logs.json | more

# Vérifier l'état des tables persistées
type data\tables_sessions.json
```
