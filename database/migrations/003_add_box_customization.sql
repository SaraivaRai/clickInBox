ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS apresentacao_tipo VARCHAR(10) NOT NULL DEFAULT 'texto'
    CHECK (apresentacao_tipo IN ('texto', 'imagem')),
  ADD COLUMN IF NOT EXISTS apresentacao_imagem TEXT,
  ADD COLUMN IF NOT EXISTS imagem_principal_original TEXT,
  ADD COLUMN IF NOT EXISTS imagem_foco_x NUMERIC(5,2)
    CHECK (imagem_foco_x IS NULL OR imagem_foco_x BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS imagem_foco_y NUMERIC(5,2)
    CHECK (imagem_foco_y IS NULL OR imagem_foco_y BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS imagem_zoom NUMERIC(4,2)
    CHECK (imagem_zoom IS NULL OR imagem_zoom BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS cor_ambientacao VARCHAR(7)
    CHECK (cor_ambientacao IS NULL OR cor_ambientacao ~ '^#[0-9A-Fa-f]{6}$');
