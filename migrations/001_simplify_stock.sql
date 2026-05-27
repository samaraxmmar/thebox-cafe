-- ════════════════════════════════════════════════════════════════════
-- THE BOX — Migration 001 : Stock direct sur produits
-- À exécuter dans Supabase Studio → SQL Editor
-- ════════════════════════════════════════════════════════════════════

-- 1) Ajouter les colonnes stock/seuil/coût/image directement sur produits
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS stock_actuel   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seuil_minimum  numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cout_unitaire  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url      text;

-- 2) Migrer le stock existant des ingrédients vers les produits
--    (si un produit a une recette de 1 unité d'un ingrédient de même nom)
UPDATE produits p
SET stock_actuel  = i.stock_actuel,
    seuil_minimum = i.seuil_minimum
FROM ingredients i
WHERE p.nom = i.nom
  AND p.stock_actuel = 0;  -- seulement si pas déjà défini

-- 3) Permettre suppression réelle : ON DELETE CASCADE sur commande_items
ALTER TABLE commande_items
  DROP CONSTRAINT IF EXISTS commande_items_produit_id_fkey;
ALTER TABLE commande_items
  ADD CONSTRAINT commande_items_produit_id_fkey
  FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE;

-- 4) (Optionnel) Supprimer les anciennes tables devenues inutiles
--    Décommente UNIQUEMENT si tu es sûr de ne plus en avoir besoin.
-- DROP TABLE IF EXISTS recettes;
-- DROP TABLE IF EXISTS ingredients;

-- ✅ Migration terminée.
-- Vérifie dans Table Editor que produits a bien les nouvelles colonnes.
