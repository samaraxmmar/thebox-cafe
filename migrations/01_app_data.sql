-- ──────────────────────────────────────────────────────────────────────
-- THE BOX — Table app_data
-- Stockage des données système (users, settings, tables layout, etc.)
-- Permet de synchroniser local et Railway sans volume.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes par updated_at (utile pour les sync incrémentales)
CREATE INDEX IF NOT EXISTS idx_app_data_updated_at ON app_data(updated_at DESC);

-- RLS : pas activé pour app_data car accédé via service_role uniquement (côté serveur).
-- Si tu actives RLS, ajoute une policy "service_role full access".

-- Optionnel : seed minimal (sera créé automatiquement par l'app au 1er boot)
-- INSERT INTO app_data (key, value) VALUES
--   ('settings', '{"cafe":{"nom":"The Box"}}'::jsonb)
-- ON CONFLICT (key) DO NOTHING;
