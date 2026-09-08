CREATE TABLE boxes (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  evento VARCHAR(100) NOT NULL,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_evento DATE,
  imagem_principal TEXT,
  musica TEXT
);

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  oauth_provider VARCHAR(50) NOT NULL,
  oauth_id VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  foto_perfil TEXT,
  UNIQUE (oauth_provider, oauth_id)
);

CREATE TABLE depoimentos (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fotos (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  arquivo VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memorias (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  titulo VARCHAR(100) NOT NULL,
  texto TEXT NOT NULL,
  foto VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessoes (
  id SERIAL PRIMARY KEY,
  token VARCHAR(128) NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TIMESTAMP NOT NULL,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios_boxes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  papel VARCHAR(50) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT usuarios_boxes_usuario_box_unique
    UNIQUE (usuario_id, box_id)
);

CREATE TABLE convites (
  id SERIAL PRIMARY KEY,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  papel VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  limite_usos INTEGER,
  usos INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT convites_limite_usos_valido
    CHECK (limite_usos IS NULL OR limite_usos > 0)
);