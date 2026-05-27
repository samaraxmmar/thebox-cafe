-- ════════════════════════════════════════════════════════════════════
-- THE BOX — Nettoyage AVANT mise en production
-- Vide les données transactionnelles SANS toucher au menu (produits).
-- À exécuter dans Supabase Studio → SQL Editor.
--
-- ⚠ IRRÉVERSIBLE. Fais un backup avant (Supabase → Database → Backups,
--   ou exporte tes tables) si tu veux garder l'historique de test.
-- ════════════════════════════════════════════════════════════════════

-- 1) Détail des commandes (FK vers commandes → supprimer en premier)
TRUNCATE TABLE commande_items RESTART IDENTITY CASCADE;

-- 2) Commandes
TRUNCATE TABLE commandes RESTART IDENTITY CASCADE;

-- 3) Log des alertes stock (si la table existe)
TRUNCATE TABLE alertes_stock RESTART IDENTITY CASCADE;

-- 4) Rapports journaliers (si la table existe)
--    Ignore l'erreur "relation does not exist" si tu n'as pas cette table.
TRUNCATE TABLE rapports_journaliers RESTART IDENTITY CASCADE;

-- 5) Sessions de table — UNIQUEMENT si tu utilises encore la table Supabase.
--    NOTE : dans la version actuelle de l'app, les sessions de table sont
--    stockées en LOCAL (data/tables_sessions.json), PAS dans Supabase.
--    Cette ligne ne sert que si tu as une ancienne table sessions_table.
-- TRUNCATE TABLE sessions_table RESTART IDENTITY CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- OPTIONNEL : réinitialiser le stock des ingrédients à 0
-- (si tu veux repartir d'un stock vide pour le vrai inventaire)
-- ════════════════════════════════════════════════════════════════════
-- UPDATE ingredients SET stock_actuel = 0;

-- ════════════════════════════════════════════════════════════════════
-- OPTIONNEL : supprimer les produits de démo (Espresso, Cappuccino...)
-- pour recréer ton vrai menu. Décommente si tu veux table rase du menu.
-- ════════════════════════════════════════════════════════════════════
-- TRUNCATE TABLE recettes RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE produits RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE ingredients RESTART IDENTITY CASCADE;

-- ✅ Vérification après nettoyage :
SELECT
  (SELECT COUNT(*) FROM commandes)       AS commandes,
  (SELECT COUNT(*) FROM commande_items)  AS lignes,
  (SELECT COUNT(*) FROM produits)        AS produits_conserves;
