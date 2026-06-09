# Sync Supabase — Configuration en 3 étapes

Avec cette config, **plus besoin de volume Railway** : tes données (users, PIN, settings, tables, etc.) sont automatiquement partagées entre ton PC local et Railway via Supabase.

## Étape 1 — Créer la table `app_data` dans Supabase

1. Va sur https://supabase.com/dashboard
2. Ouvre ton projet The Box
3. Menu gauche → **SQL Editor**
4. Clique **"+ New query"**
5. Copie-colle ce SQL :

```sql
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_data_updated_at ON app_data(updated_at DESC);
```

6. Clique **Run** (bouton vert en bas)
7. Tu devrais voir "Success. No rows returned"

## Étape 2 — Vérifier les variables d'env Railway

Sur https://railway.app/dashboard → ton service → **Variables**, vérifie que tu as :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` (MÊME url qu'en local) |
| `SUPABASE_SERVICE_KEY` | `eyJh...` (MÊME clé qu'en local) |
| `SUPABASE_KEY` | `eyJh...` (anon, fallback) |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |

⚠️ **Important** : Railway et local doivent utiliser **le même projet Supabase** pour partager les données.

## Étape 3 — Pousser les modifs et tester

Sur ton PC :

```powershell
git add .
git commit -m "Sync Supabase : storage local + push automatique"
git push
```

Railway redéploie automatiquement (~30 sec).

## Vérification

Va sur ton URL Railway, ouvre la console du navigateur (F12 si dispo) ou les logs Railway :
- Tu devrais voir : `[storage] Sync Supabase ACTIF — X clé(s) chargée(s) depuis Supabase`
- Tes données (users avec ton mdp custom, settings, plan de salle) sont les mêmes qu'en local

## Comment ça marche

- **Au boot** (local OU Railway) : le serveur récupère toutes les données depuis Supabase (table `app_data`) et écrit en local
- **À chaque modification** (changement PIN, déplacement table, etc.) : écrit en local + push asynchrone vers Supabase
- **Multi-instances** : tous les serveurs (local + Railway) sont synchronisés via Supabase
- **Hors-ligne** : si Supabase n'est pas accessible, l'app continue avec le cache local. Les modifs locales seront pushées au retour de la connexion (sur le prochain reboot)

## Si tu veux repartir from scratch sur Supabase

Dans le SQL Editor Supabase :

```sql
DELETE FROM app_data;
```

Au prochain boot local, tes données locales actuelles seront pushées vers Supabase.

## Données concernées par le sync

Toutes les clés JSON locales SAUF :
- `secrets.json` (clé HMAC de session — différente par environnement)

Donc : `users`, `settings`, `permissions`, `tables`, `tables_sessions`, `reservations`, `families`, `commandes_attribution`, `stock_overlay`, etc.
