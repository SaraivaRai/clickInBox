ALTER TABLE boxes
  ADD COLUMN atracao_tipo VARCHAR(30)
  CHECK (atracao_tipo IS NULL OR atracao_tipo IN ('espelho_magico', 'cabine_fotos'));

CREATE TABLE fotos_atracao (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  arquivo_original TEXT NOT NULL,
  arquivo_miniatura TEXT NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes > 0),
  criada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX fotos_atracao_box_idx
  ON fotos_atracao (box_id, criada_em, id);
