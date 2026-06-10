# ☕ THE BOX — Système de caisse pour café

Application web complète de **caisse (POS), gestion de tables, stock et analytics** pour le café **The Box** (Tunisie).

Conçue pour une équipe : **caissier, serveurs, manager, admin** — chacun avec ses droits.
Accessible sur **PC, tablette et téléphone** (PWA installable, mode desktop forcé possible).

---

## ✨ Fonctionnalités

### Caisse (POS)
- Catalogue produits avec **familles** (Boisson Chaude / Froide / Cake) et sous-catégories
- Panier sauvegardé par table (localStorage) — pas perdu en cas de rechargement
- Validation rapide d'une commande, ticket affiché en confirmation
- Auto-clôture de la table après paiement (configurable)
- Recherche produits, filtres par famille

### Plan de salle interactif
- **Drag-and-drop** des tables (mode édition)
- **3 formes** : carrée, rectangulaire, ronde
- **4 statuts** : libre (vert), occupée (rose), réservée (violet), en nettoyage (amber)
- **Murs / cloisons** repositionnables
- **Zones** : Salle, Comptoir, Mezzanine, Terrasse, custom
- **Réservations** (nom client, heure, nb couverts, notes)
- **Auto-organiser** (replace toutes les tables en grille propre)
- **Mode mobile** : pinch-zoom + pan + auto-fit + bouton "Centrer le plan"

### Dashboard analytique
- **6 KPI cards** avec deltas vs hier (Chiffre d'affaires, Commandes, Ticket moyen, Clients, Occupation, Stock)
- **Heatmap horaire** des ventes
- **Courbe d'évolution** CA (semaine / mois / année / tout)
- **Pie chart** Quantités vendues par produit (top 6)
- **Performance par serveur** : barres CA + commandes, tableau comparatif
- **Top produits** (Meilleures ventes) avec barres de progression dégradées
- **Niveaux de stock** (gauges colorées : OK / bas / rupture)
- **Dernières commandes** (avec serveur attribué)
- **Z-Ticket** journalier (PDF généré)

### Gestion
- **Commandes** : historique complet, filtres dates, suppression journée (admin)
- **Produits** : CRUD complet, recettes (composition d'ingrédients), images
- **Stock** : ingrédients, seuils minimum, alertes auto, mouvements traçables
- **Utilisateurs** : multi-comptes (admin / manager / caissier / serveur) avec permissions
- **Paramètres** : devise, TVA, service, logo, WhatsApp, etc.

### WhatsApp (optionnel)
- **Alertes stock** automatiques (toutes les 30 min)
- **Rapport quotidien** envoyé à 22h
- **Message Bonjour** à 8h avec liste des stocks bas
- Désactivable simplement (ne pas définir `WHATSAPP_NUMBER`)

### Mobile / PWA
- **PWA installable** sur Android (Chrome) et iOS (Safari)
- Icône sur home screen, plein écran sans barre d'URL
- **Bouton "Mode Desktop"** dans la sidebar pour forcer le rendu PC sur tél
- Plan de salle **scrollable au doigt** + pinch-to-zoom
- Modal détails table optimisée tactile

### Sync multi-environnements
- Données critiques (utilisateurs, plan, settings) **synchronisées via Supabase**
- Plus besoin de volume Railway — local et prod partagent automatiquement

---

## 🏗 Stack technique

| Layer | Technologie |
|---|---|
| Backend | **Node.js** + Express |
| Base de données | **Supabase** (PostgreSQL hébergé) |
| Frontend | **Vanilla JS** + CSS modulaire (pas de framework) |
| Charts | Chart.js 4.4 + chartjs-plugin-datalabels |
| Auth | Cookie HMAC-SHA256 + bcryptjs (PIN à 4 chiffres) |
| PDF | PDFKit |
| WhatsApp | @whiskeysockets/baileys (ESM via dynamic import) |
| Cron | node-cron |
| Logs | pino + pino-pretty |
| PWA | Service Worker + manifest.json |

Tout est en **CommonJS** sauf Baileys (importé dynamiquement). Pas de build step, pas de bundler — `node server.js` suffit.

---

## 📁 Structure du projet

```
thebox-v3/
├── server.js                    # Point d'entrée Express
├── src/
│   ├── api.js                   # Router principal /api
│   ├── auth.js                  # Auth + permissions
│   ├── db.js                    # Client Supabase
│   ├── storage.js               # Storage JSON local + sync Supabase
│   ├── middleware.js            # Rate limit, security headers
│   ├── whatsapp.js              # Baileys (WhatsApp)
│   ├── crons.js                 # Tâches planifiées
│   ├── families.js              # Familles de catégories
│   └── routes/                  # Routes API
│       ├── auth.js              # /login /logout /me
│       ├── users.js             # CRUD utilisateurs
│       ├── permissions.js
│       ├── settings.js
│       ├── produits.js          # CRUD produits + recettes
│       ├── stock.js             # Stock + mouvements
│       ├── orders.js            # POST nouvelle commande
│       ├── commandes.js         # Historique
│       ├── stats.js             # Dashboard analytics
│       ├── tables.js            # Plan de salle + réservations
│       ├── rapport.js           # Z-Ticket PDF
│       ├── logs.js
│       ├── movements.js
│       └── upload.js            # Upload images
├── public/                       # Frontend statique
│   ├── index.html               # Single Page App
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service Worker
│   ├── css/
│   │   ├── base.css             # Variables + reset
│   │   ├── components.css       # Composants UI
│   │   ├── pages.css            # Styles par page
│   │   └── mobile.css           # Overrides ≤768px
│   ├── icons/
│   │   └── icon.svg             # Icône PWA
│   └── js/
│       ├── app.js               # Bootstrap
│       ├── api.js               # Client HTTP
│       ├── auth.js              # Login form
│       ├── nav.js               # Navigation entre pages
│       ├── store.js             # Cache produits
│       ├── theme.js             # Light/dark mode
│       ├── desktop-mode.js      # Toggle mode desktop sur mobile
│       ├── caisse.js            # Page Caisse
│       ├── tables.js            # Page Tables (plan)
│       ├── dashboard.js         # Page Dashboard
│       ├── commandes.js         # Page Commandes
│       ├── stock.js             # Page Stock
│       ├── produits-page.js     # Page Produits (admin)
│       ├── users.js             # Page Utilisateurs
│       ├── settings.js          # Page Paramètres
│       └── mobile/
│           ├── mobile-detect.js  # Détection device
│           └── pinch-zoom-pan.js # Plan mobile interactif
├── migrations/
│   └── 01_app_data.sql          # Table sync Supabase
├── data/                         # JSON locaux (gitignored)
│   ├── users.json
│   ├── tables.json
│   ├── settings.json
│   └── ...
├── package.json
├── railway.json                  # Config Railway deploy
├── .env.example                  # Template variables
├── DEPLOY_RAILWAY.md             # Guide deploy Railway
├── PWA_GUIDE.md                  # Guide install PWA
└── SUPABASE_SYNC_SETUP.md        # Setup sync Supabase
```

---

## 🚀 Installation locale

### Prérequis
- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- Un projet **Supabase** gratuit ([supabase.com](https://supabase.com))

### 1. Cloner et installer
```powershell
git clone https://github.com/TON_USERNAME/thebox-cafe.git
cd thebox-cafe
npm install
```

### 2. Setup Supabase
1. Crée un projet Supabase
2. **SQL Editor** → exécute le contenu de `schema.sql` (tables : produits, ingredients, commandes, etc.)
3. **SQL Editor** → exécute aussi `migrations/01_app_data.sql` (table sync)
4. **Settings → API** → récupère `Project URL` et `service_role key`

### 3. Configurer `.env`
Copie `.env.example` en `.env` et remplis :
```ini
NODE_ENV=development
HOST=127.0.0.1
PORT=3001

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJh...
SUPABASE_KEY=eyJh...

# PINs par défaut (changeables après 1er login)
PIN_ADMIN=1234
PIN_MANAGER=2222
PIN_CAISSE=1111
PIN_SERVEUR=0000

# WhatsApp (optionnel)
WHATSAPP_NUMBER=216XXXXXXXX
```

### 4. Démarrer
```powershell
npm start
```
Ouvre [http://127.0.0.1:3001](http://127.0.0.1:3001) → login avec `admin / 1234`.

---

## ☁️ Déploiement sur Railway

Voir le guide détaillé [`DEPLOY_RAILWAY.md`](./DEPLOY_RAILWAY.md). Procédure résumée :

1. Crée un repo GitHub privé, push le code
2. Railway → Deploy from GitHub repo
3. Variables d'env (Railway dashboard) :
   ```
   NODE_ENV=production
   HOST=0.0.0.0
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   PIN_ADMIN=...
   ```
4. **Activer la sync Supabase** (voir [`SUPABASE_SYNC_SETUP.md`](./SUPABASE_SYNC_SETUP.md)) pour que local et prod partagent les données
5. Railway génère un domaine `xxx.up.railway.app`

Le healthcheck `/api/status` est intégré (`railway.json`).

---

## 📱 Installer comme app sur téléphone

Voir [`PWA_GUIDE.md`](./PWA_GUIDE.md). En résumé :

- **Android (Chrome)** : ouvre l'URL → "Ajouter à l'écran d'accueil"
- **iPhone (Safari)** : ouvre l'URL → Partager → "Sur l'écran d'accueil"

L'app s'ouvre **plein écran** comme une vraie app native, sans barre d'URL.

---

## 👥 Comptes par défaut

| Utilisateur | Rôle | PIN par défaut | Permissions |
|---|---|---|---|
| `admin` | Administrateur | 1234 (ou PIN_ADMIN) | Tout |
| `manager` | Manager | 2222 | Gestion + analytics |
| `caisse` | Caissier | 1111 | Caisse + commandes |
| `serveur` | Serveur | 0000 | Tables + commandes |

⚠️ **Changer les PINs immédiatement** après le 1er login (Paramètres → Utilisateurs).

---

## 🔐 Sécurité

- **PIN bcryptjs** (hash 10 rounds)
- **Cookie HttpOnly + SameSite=Lax** signé HMAC-SHA256
- **Session expirable** (12h par défaut, configurable `SESSION_TTL_HOURS`)
- **Rate limit** sur `/api/orders` (120/min) et `/api/stock` (60/min)
- **Service role key** Supabase côté serveur uniquement (jamais exposée au client)
- **RLS** : pas activé par défaut (le backend filtre lui-même). Activable si besoin.

---

## 🤝 API publique principale

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login `{ username, pin }` |
| `POST` | `/api/auth/logout` | Déconnexion |
| `GET` | `/api/auth/me` | Profil session |
| `GET` | `/api/produits` | Catalogue actif |
| `POST` | `/api/orders` | Nouvelle commande + déduit stock |
| `GET` | `/api/commandes` | Historique (100 dernières) |
| `GET` | `/api/stats?date=YYYY-MM-DD` | Dashboard du jour |
| `GET` | `/api/stats/evolution?days=7&date=` | Évolution CA |
| `GET` | `/api/stats/serveurs?period=day&date=` | Performance par serveur |
| `GET` | `/api/tables` | Plan de salle |
| `POST` | `/api/tables/:id/open` | Ouvrir une table `{ nb_couverts }` |
| `POST` | `/api/tables/:id/reserve` | Créer réservation |
| `GET` | `/api/rapport/z?date=` | Z-Ticket PDF |

Toutes les routes (sauf `/api/auth/*` et `/api/status`) nécessitent un cookie de session valide.

---

## 🧰 Scripts utiles

```powershell
npm start         # Production
npm run dev       # Dev avec nodemon (auto-reload)
npm run smoke     # Tests smoke basiques
```

---

## 📊 Modèle de données (Supabase)

Tables principales (voir `schema.sql` pour le détail) :

- `produits` (id, nom, prix, categorie, image_url, actif)
- `ingredients` (id, nom, stock_actuel, seuil_minimum, unite, cout)
- `produit_ingredients` (produit_id, ingredient_id, quantite) — recettes
- `commandes` (id, total, statut, created_at, table_id)
- `commande_items` (commande_id, produit_id, quantite, prix_unitaire)
- `tables_cafe` (id, nom, capacite, zone, x, y, shape, width, height, statut)
- `sessions_table` (id, table_id, nb_couverts, total, statut, opened_by, ouverte_at)
- `app_data` (key, value JSONB, updated_at) — table sync local ↔ remote

---

## 🎨 Design System

- **Couleur primaire** : emerald `#16a34a`
- **Statuts tables** :
  - 🟢 Libre `#16a34a`
  - 🌸 Occupée `#e11d48`
  - 🟣 Réservée `#7c3aed`
  - 🟡 Cleaning `#d97706`
- **Palette dashboard** : emerald, cyan, indigo, violet, pink, amber (cohérence sur tous les graphs)
- **Typographie** : Poppins (UI) + Inter (logo)
- **Border-radius** : 12-18px selon composant
- **Shadows** : douces, teintées par couleur d'accent

---

## 🐛 Troubleshooting

**Le serveur démarre mais le login ne fonctionne pas**
→ Vérifier `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` dans `.env` (ou Railway Variables).

**Sur Railway, je vois les anciens utilisateurs / PINs**
→ Activer le sync Supabase ([`SUPABASE_SYNC_SETUP.md`](./SUPABASE_SYNC_SETUP.md)). Sans ça, le container Railway est wipé à chaque deploy.

**WhatsApp ne se connecte pas**
→ Normal au 1er démarrage : un QR code apparaît dans les logs (Railway → Logs). Scanner depuis WhatsApp → Paramètres → Appareils connectés.

**Le plan de salle ne s'affiche pas sur mobile**
→ Faire un hard refresh (Ctrl+Shift+R) ou désinstaller la PWA puis réinstaller pour invalider le service worker.

---

## 📄 Licence

Projet privé — usage interne pour The Box Café.

---

*Pour toute question, voir les guides dédiés dans le dossier racine (DEPLOY_RAILWAY.md, PWA_GUIDE.md, SUPABASE_SYNC_SETUP.md).*
