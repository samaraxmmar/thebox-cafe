# The Box — App mobile (PWA)

The Box est installable comme une vraie app sur tous les téléphones et tablettes.
Pas besoin de passer par le Play Store ou l'App Store — installation directe en 10 secondes.

## 1. Pré-requis : icônes

Pour que l'app ait une belle icône sur le home screen du téléphone, génère
3 fichiers dans `public/icons/` :

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-512-maskable.png` (512×512 avec padding)

**Le plus rapide** : va sur **https://www.pwabuilder.com/imageGenerator**, upload
ton logo carré "THE BOX", télécharge le pack, copie les 3 fichiers ci-dessus dans
`public/icons/`. C'est tout.

Voir `public/icons/README.md` pour plus d'options.

## 2. Pré-requis : HTTPS

Les PWA ne marchent **que sur HTTPS** (ou localhost en dev).
Si tu déploies sur Railway, c'est automatique ✅.

## 3. Installer sur Android (Chrome)

1. Ouvre l'URL de The Box dans Chrome
2. Login normalement
3. Chrome affiche en bas : **"Ajouter The Box à l'écran d'accueil"** → clic
4. L'icône "The Box" apparaît sur le home screen
5. Tap dessus → l'app s'ouvre **en plein écran**, sans barre d'URL, comme une vraie app

Si la bannière n'apparaît pas : menu Chrome (3 points) → **"Ajouter à l'écran d'accueil"**.

## 4. Installer sur iPhone / iPad (Safari)

1. Ouvre l'URL dans **Safari** (pas Chrome iOS — Apple impose Safari pour PWA)
2. Login
3. Tap **bouton Partager** (carré avec flèche vers le haut) → **"Sur l'écran d'accueil"**
4. Confirme le nom → **Ajouter**
5. L'icône apparaît sur le home screen

## 5. Vérifier que ça marche

Sur le téléphone, ouvre l'app installée :
- ✅ Pas de barre d'URL
- ✅ Pas de bouton retour de Chrome
- ✅ Plein écran avec barre d'état verte
- ✅ Icône "The Box" dans le multitâche

Test offline :
- Mets le téléphone en mode avion
- Ouvre l'app → l'interface se charge (depuis le cache)
- Les commandes sont impossibles tant que le serveur est inaccessible (normal)

## 6. Mise à jour de l'app

Quand tu déploies une nouvelle version :
- Les utilisateurs PWA reçoivent une **notif toast** "🔄 Nouvelle version disponible"
- Ils ferment + rouvrent l'app → la nouvelle version est chargée
- Pas besoin de réinstaller

## 7. Plusieurs serveurs : un seul abonnement

Chaque tablette ou téléphone installe la PWA indépendamment. Tous les
appareils communiquent avec le **même backend Railway** → données synchronisées
en temps réel. Tu peux avoir :
- 1 tablette à la caisse
- 2 téléphones côté serveurs
- 1 admin sur PC

Tout sur la même base de données, chaque appareil fait des commandes/réservations
qui apparaissent immédiatement sur les autres.

## 8. Désinstaller

- **Android** : long-press sur l'icône → "Désinstaller"
- **iOS** : long-press → "Supprimer l'app"
- Tu peux réinstaller à tout moment depuis l'URL.

---

## Architecture technique

- **`manifest.json`** : déclare l'app (nom, icônes, thème, mode standalone)
- **`sw.js`** : service worker, met en cache l'app shell (CSS/JS) pour démarrage instantané
- **Service worker désactivé en dev local** (127.0.0.1 / localhost) pour éviter
  les surprises de cache pendant le développement
- **Cache stratégique** :
  - Assets statiques (CSS/JS) → cache-first (rapide)
  - API `/api/*` → network-first (données toujours fraîches)
