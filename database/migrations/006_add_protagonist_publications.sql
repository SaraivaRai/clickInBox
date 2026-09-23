CREATE TABLE IF NOT EXISTS publicacoes_protagonista (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  titulo VARCHAR(150) NOT NULL CHECK (BTRIM(titulo) <> ''),
  legenda TEXT,
  foto VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  excluido_em TIMESTAMPTZ,
  excluido_por INTEGER REFERENCES usuarios(id),
  CONSTRAINT publicacoes_protagonista_exclusao_consistente CHECK (
    (excluido_em IS NULL AND excluido_por IS NULL) OR
    (excluido_em IS NOT NULL AND excluido_por IS NOT NULL)
  )
);
