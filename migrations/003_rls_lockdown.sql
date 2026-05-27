-- ════════════════════════════════════════════════════════════════════
-- THE BOX — Verrouillage RLS (sécurité production)
-- Active Row Level Security et SUPPRIME les policies publiques.
--
-- Modèle de sécurité :
--   • Le serveur Express utilise la SERVICE_ROLE key → bypass RLS (full access)
--   • La ANON key (si elle fuite) → AUCUN accès (deny-all)
--   • La sécurité métier est dans Express (auth bcrypt + sessions + permissions)
--
-- À exécuter dans Supabase Studio → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- 1) Activer RLS sur toutes les tables
ALTER TABLE produits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commande_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recettes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_stock   ENABLE ROW LEVEL SECURITY;

-- 2) SUPPRIMER les anciennes policies "allow_all" (DANGEREUSES)
DROP POLICY IF EXISTS "allow_all" ON produits;
DROP POLICY IF EXISTS "allow_all" ON ingredients;
DROP POLICY IF EXISTS "allow_all" ON commandes;
DROP POLICY IF EXISTS "allow_all" ON commande_items;
DROP POLICY IF EXISTS "allow_all" ON recettes;
DROP POLICY IF EXISTS "allow_all" ON alertes_stock;

-- 3) Aucune policy créée → deny-all pour anon/authenticated.
--    La service_role bypass RLS automatiquement, donc le serveur marche.

-- ✅ Vérification : RLS activé + 0 policy publique
SELECT
  schemaname, tablename, rowsecurity,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS nb_policies
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN ('produits','ingredients','commandes','commande_items','recettes','alertes_stock');
-- Attendu : rowsecurity = true, nb_policies = 0 pour chaque table.
