# ☕ THE BOX — Système de caisse complet

Système de caisse, gestion de stock et bot WhatsApp pour le café **The Box**.

---

## 📁 Structure des fichiers

```
thebox/
├── index.html     ← Interface complète (caisse, dashboard, stock, admin)
├── server.js      ← API + Bot WhatsApp + Alertes automatiques
├── schema.sql     ← Base de données PostgreSQL complète
├── package.json   ← Dépendances Node.js
└── README.md      ← Ce fichier
```

---

## 🚀 Installation en 5 étapes

### Étape 1 — Créer la base de données (Supabase)

1. Aller sur [supabase.com](https://supabase.com) → créer un compte gratuit
2. Créer un nouveau projet (nom: `thebox`, region: la plus proche)
3. Aller dans **SQL Editor** → coller tout le contenu de `schema.sql` → **Run**
4. Récupérer dans **Settings → API** :
   - `Project URL` → `SUPABASE_URL`
   - `anon / public key` → `SUPABASE_KEY`

### Étape 2 — Installer Node.js et les dépendances

```bash
# Installer Node.js 18+ si pas déjà fait
# https://nodejs.org

# Dans le dossier thebox/
npm install
```

### Étape 3 — Configurer les variables d'environnement

Créer un fichier `.env` dans le dossier `thebox/` :

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
WHATSAPP_NUMBER=21600000000
```

> `WHATSAPP_NUMBER` = ton numéro sans le `+` (ex: `21655123456`)

Modifier `server.js` pour charger `.env` en ajoutant en première ligne :
```js
require('dotenv').config();
```
Et ajouter `dotenv` aux dépendances : `npm install dotenv`

### Étape 4 — Connecter WhatsApp

```bash
node server.js
```

Un QR code s'affiche dans le terminal. **Scanner avec WhatsApp** :
- Ouvrir WhatsApp sur ton téléphone
- Paramètres → Appareils connectés → Connecter un appareil
- Scanner le QR code

✅ Une fois connecté, tu reçois un message de confirmation.

### Étape 5 — Ouvrir l'interface

Ouvrir `index.html` dans Chrome/Firefox directement, ou servir avec :

```bash
npx serve . -p 8080
# → http://localhost:8080
```

---

## 💻 Utilisation quotidienne

### Interface caisse (`index.html`)

| Page | Usage |
|------|-------|
| **Caisse** | Sélectionner les produits, valider la commande |
| **Dashboard** | Voir les ventes du jour, graphiques de consommation |
| **Stock** | Voir les niveaux, réapprovisionner |
| **Commandes** | Historique complet |
| **Administration** | Ajouter produits, modifier les recettes |

### Bot WhatsApp — ce que tu reçois automatiquement

| Quand | Message |
|-------|---------|
| Au démarrage du serveur | Confirmation de connexion |
| Quand un stock passe sous le seuil | 🚨 Alerte immédiate |
| Toutes les 30 minutes | Vérification silencieuse (alerte si besoin) |
| Chaque soir à 22h | 📊 Rapport journalier complet |

### Exemple de message WhatsApp reçu

```
🚨 The Box — STOCK CRITIQUE

🔴 Lait entier vient de passer sous le seuil minimum !
📉 Stock actuel : 1400ml
⚠️ Seuil minimum : 2000ml

Déclenché par la commande #47
```

```
📊 The Box — Rapport du 25/04/2026

💰 Chiffre d'affaires : 127.500 DT
🧾 Commandes : 43
☕ Produit phare : Cappuccino

📦 Stock bas : 2 ingrédients
   • Lait entier
   • Café arabica
```

---

## ➕ Ajouter un nouveau produit

1. Aller dans **Administration** dans l'interface
2. Cliquer **+ Nouveau produit**
3. Remplir : nom, prix, catégorie
4. Ajouter les ingrédients de la recette avec les quantités
5. **Enregistrer**

Le produit apparaît immédiatement en caisse. Le stock se déduit automatiquement à chaque vente.

---

## 🔧 Déploiement sur serveur (Oracle Cloud Free)

```bash
# Sur le VPS Ubuntu
sudo apt update && sudo apt install -y nodejs npm nginx

# Cloner / copier le projet
cd /var/www/thebox
npm install

# Démarrage permanent avec PM2
npm install -g pm2
pm2 start server.js --name thebox
pm2 startup
pm2 save

# Servir l'interface avec Nginx
sudo nano /etc/nginx/sites-available/thebox
```

Config Nginx :
```nginx
server {
    listen 80;
    server_name TON_IP_OU_DOMAINE;

    # Interface web
    location / {
        root /var/www/thebox;
        index index.html;
    }

    # API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/thebox /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📋 API Reference

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/produits` | Liste des produits actifs |
| `POST` | `/api/orders` | Valider une commande + déduire stock |
| `GET` | `/api/stock` | État du stock |
| `PATCH` | `/api/stock/:id` | Réapprovisionner un ingrédient |
| `GET` | `/api/stats` | Stats du jour |

### Exemple — Valider une commande

```json
POST /api/orders
{
  "items": [
    {
      "produit_id": 3,
      "nom": "Cappuccino",
      "prix": 3.000,
      "quantite": 2,
      "recette": [
        { "ingredient_id": 1, "quantite": 7 },
        { "ingredient_id": 2, "quantite": 120 },
        { "ingredient_id": 3, "quantite": 2 },
        { "ingredient_id": 7, "quantite": 30 }
      ]
    }
  ]
}
```

Réponse :
```json
{ "success": true, "commande_id": 48, "total": 6.000 }
```

---

## 🛠 Évolutions possibles

- [ ] Authentification (login/mot de passe pour l'interface)
- [ ] Impression sur imprimante thermique (USB/Bluetooth)
- [ ] Paiement carte bancaire (intégration Stripe)
- [ ] Application mobile (React Native)
- [ ] Commandes WhatsApp (le client commande par message)
- [ ] Gestion de plusieurs tables / numéros de table
- [ ] Export rapport en PDF ou Excel

---

*The Box Café — Système développé avec Next.js + Supabase + WhatsApp Web.js*
