-- ============================================================
-- THE BOX — Schéma PostgreSQL complet (Supabase)
-- Exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- 1. PRODUITS DU MENU
CREATE TABLE produits (
  id          SERIAL PRIMARY KEY,
  nom         TEXT NOT NULL,
  prix        DECIMAL(10,3) NOT NULL,
  categorie   TEXT NOT NULL DEFAULT 'Boisson chaude',
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INGRÉDIENTS / STOCK BRUT
CREATE TABLE ingredients (
  id              SERIAL PRIMARY KEY,
  nom             TEXT NOT NULL,
  stock_actuel    DECIMAL(10,3) NOT NULL DEFAULT 0,
  unite           TEXT NOT NULL DEFAULT 'g',
  seuil_minimum   DECIMAL(10,3) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RECETTES : lien produit → ingrédients
CREATE TABLE recettes (
  produit_id      INT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  ingredient_id   INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite        DECIMAL(10,3) NOT NULL,
  PRIMARY KEY (produit_id, ingredient_id)
);

-- 4. COMMANDES
CREATE TABLE commandes (
  id          SERIAL PRIMARY KEY,
  total       DECIMAL(10,3) NOT NULL,
  statut      TEXT DEFAULT 'payée',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. DÉTAIL COMMANDES
CREATE TABLE commande_items (
  id              SERIAL PRIMARY KEY,
  commande_id     INT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id      INT NOT NULL REFERENCES produits(id),
  quantite        INT NOT NULL,
  prix_unitaire   DECIMAL(10,3) NOT NULL
);

-- 6. LOG ALERTES STOCK
CREATE TABLE alertes_stock (
  id              SERIAL PRIMARY KEY,
  ingredient_id   INT REFERENCES ingredients(id),
  stock_au_moment DECIMAL(10,3),
  seuil           DECIMAL(10,3),
  envoye_wa       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FONCTION : ingrédients sous le seuil
-- ============================================================
CREATE OR REPLACE FUNCTION get_ingredients_bas()
RETURNS TABLE(id INT, nom TEXT, stock_actuel DECIMAL, seuil_minimum DECIMAL, unite TEXT)
LANGUAGE SQL AS $$
  SELECT id, nom, stock_actuel, seuil_minimum, unite
  FROM ingredients
  WHERE stock_actuel < seuil_minimum
  ORDER BY (stock_actuel / NULLIF(seuil_minimum,0)) ASC;
$$;

-- ============================================================
-- FONCTION : valider commande (transaction atomique)
-- ============================================================
CREATE OR REPLACE FUNCTION valider_commande(items JSONB)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  item          JSONB;
  recette_row   RECORD;
  commande_id   INT;
  total_cmd     DECIMAL := 0;
  new_stock     DECIMAL;
  ing           RECORD;
BEGIN
  -- Calculer le total
  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    total_cmd := total_cmd + ((item->>'prix')::DECIMAL * (item->>'quantite')::INT);
  END LOOP;

  -- Créer la commande
  INSERT INTO commandes (total) VALUES (total_cmd) RETURNING id INTO commande_id;

  -- Pour chaque produit commandé
  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    -- Insérer le détail
    INSERT INTO commande_items (commande_id, produit_id, quantite, prix_unitaire)
    VALUES (
      commande_id,
      (item->>'produit_id')::INT,
      (item->>'quantite')::INT,
      (item->>'prix')::DECIMAL
    );

    -- Déduire le stock via la recette
    FOR recette_row IN
      SELECT r.ingredient_id, r.quantite AS qty_recette
      FROM recettes r
      WHERE r.produit_id = (item->>'produit_id')::INT
    LOOP
      SELECT * INTO ing FROM ingredients WHERE id = recette_row.ingredient_id;

      new_stock := ing.stock_actuel - (recette_row.qty_recette * (item->>'quantite')::INT);

      UPDATE ingredients
      SET stock_actuel = GREATEST(0, new_stock)
      WHERE id = recette_row.ingredient_id;

      -- Logger l'alerte si passage sous seuil
      IF ing.stock_actuel >= ing.seuil_minimum AND new_stock < ing.seuil_minimum THEN
        INSERT INTO alertes_stock (ingredient_id, stock_au_moment, seuil, envoye_wa)
        VALUES (ing.id, new_stock, ing.seuil_minimum, FALSE);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('commande_id', commande_id, 'total', total_cmd);
END;
$$;

-- ============================================================
-- FONCTION : stats du jour
-- ============================================================
CREATE OR REPLACE FUNCTION stats_du_jour()
RETURNS JSONB
LANGUAGE sql AS $$
  WITH
  ventes AS (
    SELECT COUNT(*) AS nb, COALESCE(SUM(total),0) AS ca
    FROM commandes
    WHERE created_at::date = CURRENT_DATE
  ),
  top AS (
    SELECT p.nom, SUM(ci.quantite) AS total_vendus
    FROM commande_items ci
    JOIN produits p ON p.id = ci.produit_id
    JOIN commandes c ON c.id = ci.commande_id
    WHERE c.created_at::date = CURRENT_DATE
    GROUP BY p.nom
    ORDER BY total_vendus DESC
    LIMIT 1
  ),
  alertes AS (
    SELECT COUNT(*) AS nb FROM ingredients WHERE stock_actuel < seuil_minimum
  )
  SELECT jsonb_build_object(
    'nb_commandes', ventes.nb,
    'chiffre_affaires', ventes.ca,
    'top_produit', top.nom,
    'top_produit_qty', top.total_vendus,
    'nb_alertes', alertes.nb
  )
  FROM ventes, top, alertes;
$$;

-- ============================================================
-- DONNÉES DE DÉPART — INGRÉDIENTS
-- ============================================================
INSERT INTO ingredients (nom, stock_actuel, unite, seuil_minimum) VALUES
  ('Café arabica',       1000,  'g',     200),
  ('Lait entier',        3000,  'ml',    2000),
  ('Sucre',              2000,  'g',     500),
  ('Glace pilée',        2000,  'g',     500),
  ('Sirop caramel',      500,   'ml',    100),
  ('Sirop vanille',      500,   'ml',    100),
  ('Crème chantilly',    600,   'ml',    150),
  ('Eau',                10000, 'ml',    2000),
  ('Chocolat en poudre', 500,   'g',     100),
  ('Cannelle',           100,   'g',     20),
  ('Croissant',          20,    'unité', 3),
  ('Pain de mie',        10,    'unité', 2),
  ('Thé en sachet',      50,    'unité', 10),
  ('Café soluble',       300,   'g',     50);

-- ============================================================
-- DONNÉES DE DÉPART — PRODUITS & RECETTES
-- ============================================================

-- Boissons chaudes
INSERT INTO produits (nom, prix, categorie) VALUES
  ('Espresso',            1.500, 'Boisson chaude'),
  ('Café au lait',        2.500, 'Boisson chaude'),
  ('Cappuccino',          3.000, 'Boisson chaude'),
  ('Latte macchiato',     3.500, 'Boisson chaude'),
  ('Café noisette',       2.500, 'Boisson chaude'),
  ('Café crème',          2.800, 'Boisson chaude'),
  ('Chocolat chaud',      3.000, 'Boisson chaude'),
  ('Thé chaud',           1.500, 'Boisson chaude'),
  ('Café turc',           2.000, 'Boisson chaude');

-- Boissons froides
INSERT INTO produits (nom, prix, categorie) VALUES
  ('Frappuccino',         5.000, 'Boisson froide'),
  ('Frappuccino caramel', 5.500, 'Boisson froide'),
  ('Café glacé',          4.000, 'Boisson froide'),
  ('Latte glacé',         4.500, 'Boisson froide'),
  ('Chocolat glacé',      4.500, 'Boisson froide'),
  ('Eau minérale',        1.000, 'Boisson froide');

-- Pâtisseries
INSERT INTO produits (nom, prix, categorie) VALUES
  ('Croissant beurre',    2.000, 'Pâtisserie'),
  ('Toast beurre',        1.500, 'Pâtisserie');

-- ============================================================
-- RECETTES
-- ============================================================
-- Espresso (id=1)
INSERT INTO recettes VALUES (1,1,7),(1,3,2);
-- Café au lait (id=2)
INSERT INTO recettes VALUES (2,1,7),(2,2,120),(2,3,2);
-- Cappuccino (id=3)
INSERT INTO recettes VALUES (3,1,7),(3,2,120),(3,3,2),(3,7,30);
-- Latte macchiato (id=4)
INSERT INTO recettes VALUES (4,1,7),(4,2,180),(4,3,2);
-- Café noisette (id=5)
INSERT INTO recettes VALUES (5,1,7),(5,2,30),(5,3,2);
-- Café crème (id=6)
INSERT INTO recettes VALUES (6,1,7),(6,7,40),(6,3,2);
-- Chocolat chaud (id=7)
INSERT INTO recettes VALUES (7,2,150),(7,9,20),(7,3,5);
-- Thé chaud (id=8)
INSERT INTO recettes VALUES (8,13,1),(8,8,250),(8,3,2);
-- Café turc (id=9)
INSERT INTO recettes VALUES (9,1,10),(9,3,5),(9,8,80);
-- Frappuccino (id=10)
INSERT INTO recettes VALUES (10,1,30),(10,2,200),(10,3,15),(10,4,100);
-- Frappuccino caramel (id=11)
INSERT INTO recettes VALUES (11,1,30),(11,2,200),(11,3,15),(11,4,100),(11,5,20),(11,7,30);
-- Café glacé (id=12)
INSERT INTO recettes VALUES (12,1,14),(12,4,80),(12,3,5),(12,2,50);
-- Latte glacé (id=13)
INSERT INTO recettes VALUES (13,1,14),(13,2,180),(13,4,80),(13,3,3);
-- Chocolat glacé (id=14)
INSERT INTO recettes VALUES (14,9,25),(14,2,150),(14,4,100),(14,3,10),(14,7,30);
-- Eau minérale (id=15)
INSERT INTO recettes VALUES (15,8,500);
-- Croissant beurre (id=16)
INSERT INTO recettes VALUES (16,11,1);
-- Toast beurre (id=17)
INSERT INTO recettes VALUES (17,12,2);

-- ============================================================
-- ROW LEVEL SECURITY (optionnel en prod)
-- ============================================================
ALTER TABLE produits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commande_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recettes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_stock   ENABLE ROW LEVEL SECURITY;

-- Accès public en lecture/écriture (à restreindre avec auth en prod)
CREATE POLICY "allow_all" ON produits        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ingredients     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON commandes       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON commande_items  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON recettes        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON alertes_stock   FOR ALL USING (true) WITH CHECK (true);
