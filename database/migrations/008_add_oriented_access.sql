ALTER TABLE usuarios
  ALTER COLUMN oauth_provider DROP NOT NULL,
  ALTER COLUMN oauth_id DROP NOT NULL;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_oauth_consistente CHECK (
    (oauth_provider IS NULL AND oauth_id IS NULL) OR
    (oauth_provider IS NOT NULL AND oauth_id IS NOT NULL)
  );

CREATE UNIQUE INDEX usuarios_email_normalizado_unique
  ON usuarios (LOWER(BTRIM(email)));

CREATE TABLE acessos_orientados (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado_em TIMESTAMPTZ,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso_em TIMESTAMPTZ,
  CONSTRAINT acessos_orientados_validade CHECK (expira_em > criado_em)
);

CREATE UNIQUE INDEX acessos_orientados_ativo_usuario_box_unique
  ON acessos_orientados (usuario_id, box_id)
  WHERE revogado_em IS NULL;

CREATE INDEX acessos_orientados_box_idx ON acessos_orientados (box_id);
