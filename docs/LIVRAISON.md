# THE BOX — Checklist livraison & email client

---

## ✅ Checklist AVANT remise au client

### Sécurité
- [ ] `.gitignore` présent et inclut `.env`, `data/`, `auth_info_baileys/`, `.thebox-baileys/`
- [ ] `git ls-files .env auth_info_baileys/` → vide (rien de secret n'est dans git)
- [ ] `.env.example` propre (placeholders uniquement, **pas** de vraies clés)
- [ ] PINs par défaut **changés** via Utilisateurs (ou définis dans `.env` PIN_ADMIN/PIN_MANAGER/PIN_CAISSE/PIN_SERVEUR)
- [ ] Hint des PINs **retiré** du login (déjà fait)
- [ ] Supabase RLS verrouillé (script `migrations/003_rls_lockdown.sql` exécuté)
- [ ] `SUPABASE_SERVICE_KEY` configurée (et **pas** la anon key)

### Données
- [ ] `migrations/002_cleanup_production.sql` exécuté → BD vide (pas de commandes de test)
- [ ] Menu réel saisi (produits du café, pas les démos Espresso/Cappuccino par défaut)
- [ ] `data/tables.json` reflète les vraies tables du café (8 par défaut, modifiable)

### Fonctionnel
- [ ] `npm run smoke` → tous les tests passent ✅
- [ ] `npm start` démarre sans erreur dans la console
- [ ] http://localhost:3001 charge le login en < 2s
- [ ] Login `admin` réussit → arrive sur Caisse
- [ ] Une vente test passe de bout en bout (ouvrir table → produit → valider → PDF)
- [ ] Rapport PDF du jour se télécharge sans crash
- [ ] WhatsApp : QR scanné, message "✅ The Box démarré" reçu
- [ ] Alerte stock testée : forcer un produit suivi en dessous du seuil → WhatsApp reçu

### Robustesse
- [ ] Redémarrer Node pendant qu'une table est ouverte → table toujours ouverte au restart ✅
- [ ] Fermer Chrome puis rouvrir → session conservée (cookie 12h)
- [ ] Stock à 0 → vente toujours autorisée

### Package livré au client
- [ ] Dossier `thebox-v3/` complet (sans `node_modules`, `dist`, `.git`, `data` vide si tu veux table rase)
- [ ] `start.bat` + `install-autostart.bat` présents
- [ ] `docs/GUIDE-UTILISATEUR.md` joint (ou imprimé)
- [ ] `.env` avec les vraies credentials Supabase de PRODUCTION (pas celles de dev)
- [ ] `node_modules` installé sur le PC du café (`npm install` fait sur place)

---

## ✉️ Email de livraison (template)

```
Objet : The Box — Livraison de votre système de caisse

Bonjour Samar,

Votre système de caisse "The Box" est prêt et opérationnel sur le PC du café.

🚀 Démarrage
Pour lancer l'application :
1. Double-cliquez sur "start.bat" (raccourci sur le bureau)
2. Attendez 3-5 secondes que la fenêtre noire affiche "THE BOX — http://127.0.0.1:3001"
3. Ouvrez Chrome → http://localhost:3001

Le serveur démarre aussi automatiquement à chaque allumage du PC
(tâche planifiée Windows TheBoxPOS).

🔑 Identifiants (À CHANGER dès la première connexion)
• Administrateur — identifiant: admin    — PIN: 1234
• Manager        — identifiant: manager  — PIN: 2222
• Caissier       — identifiant: caisse   — PIN: 1111
• Serveur        — identifiant: serveur  — PIN: 0000

⚠ IMPORTANT : connectez-vous en tant qu'admin et changez ces 4 PINs
via le menu "Utilisateurs". Les PINs par défaut sont publics.

📖 Documentation
Vous trouverez ci-joint :
• GUIDE-UTILISATEUR.pdf — guide rapide d'une page pour vous et vos serveurs
• Liste des fonctionnalités principales

📱 WhatsApp
Au premier démarrage, un QR code s'affichera dans la console pour connecter
WhatsApp à votre compte. Une fois scanné, vous recevrez automatiquement :
• Une alerte dès qu'un produit suivi passe sous son seuil de stock
• Un rapport quotidien à 22h00 (CA, nb commandes, top produit, alertes)
• Un message de "bonjour" à 8h00 avec l'état du stock

🛟 Support
Pour toute question pendant les 30 premiers jours :
• [ton email]
• [ton téléphone]

Je vous appellerai vendredi pour faire un point sur la première semaine
d'utilisation.

Bonne mise en service !
[Ton nom]
```

---

## 🔍 À surveiller la première semaine

Garde un œil sur **`data/logs.json`** (visible dans Paramètres → Logs) et vérifie chaque jour :

| Problème potentiel | Comment détecter | Action |
|---|---|---|
| **WhatsApp déconnecté** | Console "WA] Déconnecté", pas d'alerte reçue | Re-scanner QR, vérifier le téléphone du gérant connecté |
| **Table bloquée "Occupée"** | Une table reste orange depuis > 1h sans activité | Cliquer → Clôturer manuellement. Si récurrent, voir si serveur ferme bien |
| **Stock négatif anormal** | Produit à -50 en stock alors qu'il a été réapprovisionné | Vérifier que les réappros ont bien été saisis. Ajuster via Stock |
| **Erreurs PDF** | "ERR_STREAM_WRITE_AFTER_END" dans logs | Normalement bloqué par nos protections. Sinon redémarrer Node |
| **Perte session Baileys** | Plus aucune alerte WhatsApp, pas de QR | Supprimer `%APPDATA%\.thebox-baileys` (ou `auth_info_baileys/`) et re-scanner |
| **Lenteur Supabase** | Charts qui mettent > 5s à charger | Vérifier quota Supabase (Dashboard → Settings → Usage) — 500 MB free tier |
| **Quota Supabase dépassé** | Erreurs 500 sur toutes les routes Supabase | Faire du `migrations/002_cleanup_production.sql` (vider vieilles commandes) |

**Avant d'appeler le support, demande au client de** :
1. Faire une capture de la console serveur (fenêtre noire)
2. Aller dans Paramètres → Logs → cliquer Rafraîchir → screenshot
3. Préciser l'heure exacte du problème

---

## 📦 Étape 4 — Déploiement (résumé pour ton cas)

Tu es **déjà configuré pour le mode local Windows** (option recommandée) :
- `start.bat` + `install-autostart.bat` créés
- `HOST=0.0.0.0` dans `.env` permet l'accès LAN
- 2-5 postes peuvent se connecter en `http://<ip-pc-café>:3001`

**ngrok n'est PAS nécessaire** sauf si tu veux accéder au dashboard depuis chez toi. Si oui :
```powershell
# Une fois sur ngrok.com (free) :
ngrok http 3001
# → te donne une URL publique https://xxxx.ngrok-free.app
```
⚠ ngrok free expose ton serveur en HTTPS — assure-toi que les PINs sont forts avant.

---

## 🗄️ Étape 5 — Base de données (résumé)

Vu que tu utilises déjà un projet Supabase :

1. **Pour la prod** : créer un **NOUVEAU projet Supabase** distinct du dev
2. Exécuter dans l'ordre :
   - `schema.sql` (structure de base)
   - `migrations/001_simplify_stock.sql` (optionnel, ajoute colonnes stock — pas obligatoire avec l'overlay JSON local)
   - `migrations/003_rls_lockdown.sql` (sécurité)
3. Mettre l'URL + service_role key dans `.env` du PC café
4. **Backups Supabase free** : automatiques quotidiens, 7 jours de rétention (rien à faire, déjà actif sur le free tier)
5. **Surveiller l'usage** : Dashboard Supabase → Database → Tables → Size. Reste sous 500 MB :
   - Une commande = ~200 octets
   - 100 commandes/jour × 365 = ~7 MB/an → tu es très large

Pour vider l'historique annuellement : `migrations/002_cleanup_production.sql`.
