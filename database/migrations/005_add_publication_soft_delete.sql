ALTER TABLE depoimentos
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por INTEGER REFERENCES usuarios(id);

ALTER TABLE memorias
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por INTEGER REFERENCES usuarios(id);

ALTER TABLE fotos
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por INTEGER REFERENCES usuarios(id);

ALTER TABLE depoimentos
  DROP CONSTRAINT IF EXISTS depoimentos_exclusao_consistente,
  ADD CONSTRAINT depoimentos_exclusao_consistente CHECK (
    (excluido_em IS NULL AND excluido_por IS NULL) OR
    (excluido_em IS NOT NULL AND excluido_por IS NOT NULL)
  );

ALTER TABLE memorias
  DROP CONSTRAINT IF EXISTS memorias_exclusao_consistente,
  ADD CONSTRAINT memorias_exclusao_consistente CHECK (
    (excluido_em IS NULL AND excluido_por IS NULL) OR
    (excluido_em IS NOT NULL AND excluido_por IS NOT NULL)
  );

ALTER TABLE fotos
  DROP CONSTRAINT IF EXISTS fotos_exclusao_consistente,
  ADD CONSTRAINT fotos_exclusao_consistente CHECK (
    (excluido_em IS NULL AND excluido_por IS NULL) OR
    (excluido_em IS NOT NULL AND excluido_por IS NOT NULL)
  );
