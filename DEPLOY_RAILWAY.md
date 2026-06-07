# Déployer The Box sur Railway

## 1. Pré-requis

- Compte GitHub (gratuit) : https://github.com/signup
- Compte Railway (gratuit) : https://railway.app/login → "Login with GitHub"
- Git installé sur ton PC

## 2. Initialiser le dépôt Git (1ère fois seulement)

Ouvre un terminal dans `C:\Users\samar\Documents\thebox-v3` :

```bash
git init
git add .
git commit -m "Initial commit — The Box v3.1"
```

## 3. Créer un repo GitHub

1. Va sur https://github.com/new
2. Repository name : `thebox-cafe`
3. **Private** (recommandé)
4. **Ne pas** cocher "Initialize with README"
5. Clic **Create repository**

Puis copie les commandes affichées et lance-les dans ton terminal :

```bash
git remote add origin https://github.com/TON_USERNAME/thebox-cafe.git
git branch -M main
git push -u origin main
```

## 4. Déployer sur Railway

1. Va sur https://railway.app/new
2. Clic **Deploy from GitHub repo**
3. Autorise Railway à accéder à `thebox-cafe`
4. Sélectionne le repo → Railway détecte Node.js et démarre le build

## 5. Configurer les variables d'environnement

Dans Railway → **Variables** → ajoute une par une :

```
NODE_ENV=production
HOST=0.0.0.0
LOG_LEVEL=info
SESSION_TTL_HOURS=12
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJh...  (ta service_role key)
SUPABASE_KEY=eyJh...           (ta anon key, fallback)
THEBOX_DATA_DIR=/data
```

**WhatsApp** (optionnel) :
```
WHATSAPP_NUMBER=216XXXXXXXX
```

**PIN d'admin** (à changer ABSOLUMENT en prod) :
```
PIN_ADMIN=ton_pin_secret_admin
PIN_MANAGER=...
PIN_CAISSE=...
PIN_SERVEUR=...
```

> ⚠️ **Ne PAS** définir `PORT` — Railway l'injecte automatiquement.
> ⚠️ **SESSION_SECRET** : laisse vide, il sera auto-généré et persisté.

## 6. Ajouter un volume pour persister les données

Railway redémarre les containers à chaque deploy → tes JSON locaux (`data/users.json`, `data/tables.json`, etc.) seraient effacés.

1. Dans ton service Railway → onglet **Settings** → section **Volumes**
2. Clic **+ New Volume**
3. **Mount path** : `/data`
4. **Size** : 1 Go suffit largement
5. Clic **Add**

Railway va redémarrer le service avec le volume monté. Comme `THEBOX_DATA_DIR=/data`, tous les JSON seront stockés dans ce volume persistant.

## 7. Générer un domaine public

1. Onglet **Settings** → section **Networking**
2. Clic **Generate Domain**
3. Railway génère `thebox-cafe-production-xxxx.up.railway.app`

Ouvre ce domaine dans ton navigateur → **The Box est en ligne !** 🎉

## 8. (Optionnel) Domaine perso

Onglet **Settings** → **Custom Domain** → entre ton domaine (ex: `caisse.theboxcafe.tn`) → Railway te donne un enregistrement CNAME à ajouter chez ton registrar.

---

## Mises à jour

À chaque modification du code :

```bash
git add .
git commit -m "Description de la modif"
git push
```

Railway détecte le push et redéploie automatiquement (≈30s). Le volume `/data` est préservé.

## Premier login

Après le deploy, va sur le domaine et connecte-toi avec les identifiants par défaut **(et change les PINs immédiatement)** :

| Utilisateur | PIN par défaut |
|---|---|
| `admin`   | `1234` (ou `PIN_ADMIN`) |
| `manager` | `2222` (ou `PIN_MANAGER`) |
| `caisse`  | `1111` (ou `PIN_CAISSE`) |
| `serveur` | `0000` (ou `PIN_SERVEUR`) |

---

## Coûts attendus

- **Crédit gratuit** : 5 $/mois (≈ 500h d'exécution)
- **The Box** consomme ~0.005 $/h en idle → tient largement dans le free tier
- Si le café est ouvert 12h/jour → ~1.8 $/mois (compris dans le crédit gratuit)
- Au-delà : ~5 $/mois si trafic important

## Troubleshooting

**Le build échoue : "Cannot find module"**
→ Vérifie que `package.json` et `package-lock.json` sont bien commités.

**"Supabase URL is required"**
→ Variables d'environnement manquantes. Settings → Variables → vérifie `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`.

**Le login ne marche pas**
→ Le volume n'a pas été créé → users.json est régénéré à chaque deploy avec les PINs par défaut. Vérifie le volume monté sur `/data` ET `THEBOX_DATA_DIR=/data`.

**WhatsApp ne se connecte pas**
→ Normal — Baileys nécessite un QR code à scanner depuis les logs Railway (Logs → cherche "QR code"). Ou désactive en retirant `WHATSAPP_NUMBER`.
