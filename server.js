require("dotenv").config({ override: true });
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const DIAS_ANTES_ESCRITA_CONVIDADO = 1;
const DIAS_DEPOIS_ESCRITA = 5;

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }

    cb(new Error("Apenas imagens são permitidas"));
  },
});

const protagonistUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Apenas imagens são permitidas"));
  },
});

const adminUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 30 * 1024 * 1024, files: 3 },
});

async function processarImagem(caminhoOriginal) {
  const caminhoFinal = caminhoOriginal + ".jpg";

  await sharp(caminhoOriginal)
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 82,
      mozjpeg: true,
    })
    .toFile(caminhoFinal);

  fs.unlinkSync(caminhoOriginal);

  return caminhoFinal;
}
const app = express();

app.set("trust proxy", 1);
const PORT = 3000;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

function gerarTokenConvite() {
  return crypto.randomBytes(32).toString("hex");
}

app.use(express.json());
app.use("/css", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));
app.use("/assets", express.static(__dirname + "/assets"));
app.use(
  "/uploads/perfis",
  express.static(path.join(__dirname, "uploads", "perfis")),
);
app.use(
  "/uploads/boxes",
  express.static(path.join(__dirname, "uploads", "boxes")),
);

app.get("/manifest.webmanifest", (req, res) => {
  res.sendFile(path.join(__dirname, "manifest.webmanifest"));
});

function obterCookie(req, nome) {
  const cookies = req.headers.cookie;

  if (!cookies) {
    return null;
  }

  const cookieEncontrado = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${nome}=`));

  if (!cookieEncontrado) {
    return null;
  }

  return decodeURIComponent(cookieEncontrado.substring(nome.length + 1));
}

async function criarConvite(boxId, papel, limiteUsos, executor = pool) {
  const token = gerarTokenConvite();

  const resultado = await executor.query(
    `
      INSERT INTO convites (box_id, papel, token, limite_usos)
      VALUES ($1, $2, $3, $4)
      RETURNING id, box_id, papel, token, limite_usos, usos, ativo
    `,
    [boxId, papel, token, limiteUsos],
  );

  return resultado.rows[0];
}

function podeEscreverNaBox(papel, dataEvento) {
  if (papel === "adm") {
    return true;
  }

  const agora = new Date();
  const evento = new Date(dataEvento);

  const fimEscrita = new Date(evento);
  fimEscrita.setDate(fimEscrita.getDate() + DIAS_DEPOIS_ESCRITA);
  fimEscrita.setHours(23, 59, 59, 999);

  if (agora > fimEscrita) {
    return false;
  }
  if (papel === "convidado") {
    const inicioEscrita = new Date(evento);

    inicioEscrita.setDate(
      inicioEscrita.getDate() - DIAS_ANTES_ESCRITA_CONVIDADO,
    );

    inicioEscrita.setHours(0, 0, 0, 0);

    if (agora < inicioEscrita) {
      return false;
    }
  }

  return true;
}

async function autenticarUsuario(req, res, next) {
  const tokenSessao = obterCookie(req, "clickinbox_session");

  if (!tokenSessao) {
    return res.status(401).json({ erro: "Usuário não autenticado" });
  }

  const resultado = await pool.query(
    `SELECT sessoes.usuario_id,
          sessoes.expira_em,
          usuarios.admin
   FROM sessoes
   JOIN usuarios
     ON usuarios.id = sessoes.usuario_id
   WHERE sessoes.token = $1
     AND sessoes.expira_em > CURRENT_TIMESTAMP`,
    [tokenSessao],
  );

  if (resultado.rows.length === 0) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada" });
  }

  req.usuario = {
    id: resultado.rows[0].usuario_id,
    admin: resultado.rows[0].admin,
  };

  const validadeAtual = new Date(resultado.rows[0].expira_em);

  const novaValidade = new Date();
  novaValidade.setDate(novaValidade.getDate() + 10);

  if (novaValidade > validadeAtual) {
    await pool.query(
      `UPDATE sessoes
     SET expira_em = $1
     WHERE token = $2`,
      [novaValidade, tokenSessao],
    );

    const cookieSeguro = process.env.NODE_ENV === "production";

    res.cookie("clickinbox_session", tokenSessao, {
      httpOnly: true,
      secure: cookieSeguro,
      sameSite: "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    });

    console.log("Sessão renovada no banco");
  }

  next();
}

function obterDestinoLogin(req) {
  if (req.conviteBoxId && req.params.token) {
    const retorno = `/convite/${encodeURIComponent(req.params.token)}`;
    return `/boxes/${req.conviteBoxId}?retorno=${encodeURIComponent(retorno)}`;
  }

  return `/login.html?retorno=${encodeURIComponent(req.originalUrl)}`;
}

async function identificarBoxDoConvite(req, res, next) {
  try {
    const resultado = await pool.query(
      "SELECT box_id FROM convites WHERE token = $1",
      [req.params.token],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).send("Convite inválido.");
    }

    req.conviteBoxId = resultado.rows[0].box_id;
    next();
  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro interno do servidor.");
  }
}

async function autenticarPagina(req, res, next) {
  const tokenSessao = obterCookie(req, "clickinbox_session");

  if (!tokenSessao) {
    return res.redirect(obterDestinoLogin(req));
  }

  const resultado = await pool.query(
    `
    SELECT usuario_id
    FROM sessoes
    WHERE token = $1
      AND expira_em > CURRENT_TIMESTAMP
  `,
    [tokenSessao],
  );

  if (resultado.rows.length === 0) {
    res.clearCookie("clickinbox_session");

    return res.redirect(obterDestinoLogin(req));
  }

  return autenticarUsuario(req, res, next);
}

function autorizarAdmin(req, res, next) {
  if (!req.usuario?.admin) {
    if (req.path.startsWith("/api/")) {
      return res.status(403).json({ erro: "Acesso restrito a administradores" });
    }
    return res.status(403).send("Acesso restrito a administradores");
  }
  next();
}

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});
app.get("/perfil", autenticarPagina, function (req, res) {
  res.sendFile(__dirname + "/perfil.html");
});
app.get("/login.html", function (req, res) {
  res.sendFile(__dirname + "/login.html");
});

const ACESSO_ORIENTADO_DIAS_VALIDADE = 30;
const ACESSO_ORIENTADO_MAX_TENTATIVAS = 5;
const ACESSO_ORIENTADO_JANELA_MS = 15 * 60 * 1000;
const tentativasAcessoOrientado = new Map();

function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizarCodigoOrientado(codigo) {
  return String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCodigoOrientado(codigo) {
  return crypto
    .createHash("sha256")
    .update(normalizarCodigoOrientado(codigo))
    .digest("hex");
}

function gerarCodigoOrientado() {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let codigo = "";
  for (let indice = 0; indice < 12; indice += 1) {
    codigo += alfabeto[crypto.randomInt(0, alfabeto.length)];
  }
  return codigo.match(/.{1,4}/g).join("-");
}

async function criarRegistroAcessoOrientado(executor, boxId, usuarioId, criadoPor) {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const codigo = gerarCodigoOrientado();
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + ACESSO_ORIENTADO_DIAS_VALIDADE);
    try {
      const resultado = await executor.query(
        `INSERT INTO acessos_orientados
           (box_id, usuario_id, codigo_hash, expira_em, criado_por)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, expira_em`,
        [boxId, usuarioId, hashCodigoOrientado(codigo), expiraEm, criadoPor],
      );
      return { ...resultado.rows[0], codigo };
    } catch (erro) {
      if (erro.code !== "23505") throw erro;
    }
  }
  throw new Error("Não foi possível gerar um código único");
}

async function criarSessaoUsuario(res, usuarioId) {
  const tokenSessao = crypto.randomBytes(32).toString("hex");
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + 20);
  await pool.query(
    `INSERT INTO sessoes (token, usuario_id, expira_em)
     VALUES ($1, $2, $3)`,
    [tokenSessao, usuarioId, expiraEm],
  );
  res.cookie("clickinbox_session", tokenSessao, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 20 * 24 * 60 * 60 * 1000,
  });
}
app.get(
  ["/admin/boxes", "/admin/boxes/nova", "/admin/boxes/:id/editar"],
  autenticarPagina,
  autorizarAdmin,
  function (req, res) {
    res.sendFile(path.join(__dirname, "admin-boxes.html"));
  },
);
app.get("/boxes/:boxId", function (req, res) {
  res.sendFile(__dirname + "/box.html");
});

app.get(
  "/boxes/:boxId/album",
  autenticarPagina,
  autorizarBox,
  function (req, res) {
    res.sendFile(__dirname + "/album.html");
  },
);

app.get(
  "/boxes/:boxId/depoimentos",
  autenticarPagina,
  autorizarBox,
  function (req, res) {
    res.sendFile(__dirname + "/depoimentos.html");
  },
);
async function autorizarBox(req, res, next) {
  const boxId = req.params.boxId;

  if (req.usuario.admin) {
    return next();
  }

  const vinculo = await pool.query(
    "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
    [req.usuario.id, boxId],
  );

  if (vinculo.rows.length === 0) {
    return res.status(403).send("Acesso não autorizado a esta Box");
  }

  next();
}

async function obterPapelNaBox(usuarioId, boxId) {
  const vinculo = await pool.query(
    "SELECT papel FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
    [usuarioId, boxId],
  );
  return vinculo.rows[0]?.papel || null;
}

function papelPodeModerarPublicacoes(papel) {
  return papel === "protagonista" || papel === "adm";
}

function papelPodePublicarNaProtagonista(papel) {
  return papel === "protagonista" || papel === "mae" || papel === "adm";
}

app.get(
  "/boxes/:boxId/memorias",
  autenticarPagina,
  autorizarBox,
  function (req, res) {
    res.sendFile(__dirname + "/memorias.html");
  },
);

app.get(
  "/boxes/:boxId/pessoas",
  autenticarPagina,
  autorizarBox,
  function (req, res) {
    res.sendFile(__dirname + "/pessoas.html");
  },
);

app.get(
  "/boxes/:boxId/protagonista",
  autenticarPagina,
  autorizarBox,
  function (req, res) {
    res.sendFile(__dirname + "/protagonista.html");
  },
);

app.get("/api/status", function (req, res) {
  res.json({
    status: "ok",
    projeto: "Click In Box",
  });
});

app.get("/api/boxes", async function (req, res) {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, evento, imagem_principal
       FROM boxes
       WHERE visivel_home = TRUE
         AND imagem_principal IS NOT NULL
         AND BTRIM(imagem_principal) <> ''
       ORDER BY id DESC`,
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível listar as Boxes" });
  }
});

app.get("/api/boxes/:id", async function (req, res) {
  const boxId = req.params.id;

  try {
    const resultado = await pool.query("SELECT * FROM boxes WHERE id = $1", [
      boxId,
    ]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({
        erro: "Box não encontrada",
      });
    }
    res.json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro interno do servidor",
    });
  }
});

app.get(
  "/api/boxes/:boxId/usuarios",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const boxExiste = await pool.query("SELECT id FROM boxes WHERE id = $1", [
        boxId,
      ]);

      if (boxExiste.rows.length === 0) {
        return res.status(404).json({
          erro: "Box não encontrada",
        });
      }
      const resultado = await pool.query(
        "SELECT usuarios.id, usuarios.nome, usuarios.foto_perfil, usuarios_boxes.papel FROM usuarios " +
          "JOIN usuarios_boxes ON usuarios.id = usuarios_boxes.usuario_id " +
          "JOIN boxes ON boxes.id = usuarios_boxes.box_id " +
          "WHERE boxes.id = $1 AND usuarios_boxes.papel <> 'adm' " +
          "ORDER BY " +
          "CASE usuarios_boxes.papel " +
          "WHEN 'protagonista' THEN 1 " +
          "WHEN 'mae' THEN 2 " +
          "WHEN 'pai' THEN 3 " +
          "WHEN 'coautora' THEN 4 " +
          "WHEN 'cerimonialista' THEN 5 " +
          "WHEN 'convidado' THEN 6 " +
          "ELSE 7 END, " +
          "usuarios.nome ASC",
        [boxId],
      );

      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);

      res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }
  },
);

app.get("/api/boxes/:boxId/participantes", async function (req, res) {
  const boxId = req.params.boxId;

  try {
    const resultado = await pool.query(
      `SELECT usuarios.nome,
              usuarios.foto_perfil,
              usuarios_boxes.papel
       FROM usuarios
       JOIN usuarios_boxes
         ON usuarios.id = usuarios_boxes.usuario_id
       WHERE usuarios_boxes.box_id = $1
         AND usuarios_boxes.papel IN ('protagonista', 'mae', 'pai', 'coautora', 'cerimonialista')
       ORDER BY usuarios.nome ASC`,
      [boxId],
    );

    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro interno do servidor",
    });
  }
});

app.get(
  "/api/boxes/:boxId/depoimentos",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const resultado = await pool.query(
        "SELECT depoimentos.id, usuarios.nome, usuarios.foto_perfil, usuarios_boxes.papel, depoimentos.mensagem " +
          "FROM depoimentos " +
          "JOIN usuarios ON usuarios.id = depoimentos.usuario_id " +
          "JOIN usuarios_boxes ON usuarios_boxes.usuario_id = usuarios.id " +
          "AND usuarios_boxes.box_id = depoimentos.box_id " +
          "WHERE depoimentos.box_id = $1 AND depoimentos.excluido_em IS NULL " +
          "ORDER BY depoimentos.criado_em DESC",
        [boxId],
      );
      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);

      res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }
  },
);

app.get(
  "/api/boxes/:boxId/memorias",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const resultado = await pool.query(
        "SELECT memorias.id, usuarios.nome, usuarios_boxes.papel, " +
          "memorias.titulo, memorias.texto, memorias.foto " +
          "FROM memorias " +
          "JOIN usuarios ON usuarios.id = memorias.usuario_id " +
          "JOIN usuarios_boxes ON usuarios_boxes.usuario_id = usuarios.id " +
          "AND usuarios_boxes.box_id = memorias.box_id " +
          "WHERE memorias.box_id = $1 AND memorias.excluido_em IS NULL " +
          "ORDER BY memorias.criado_em DESC",
        [boxId],
      );

      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);

      res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }
  },
);

app.get("/api/memorias/:id/foto", autenticarUsuario, async function (req, res) {
  const memoriaId = req.params.id;

  try {
    const resultado = await pool.query(
      "SELECT id, box_id, foto FROM memorias WHERE id = $1 AND excluido_em IS NULL",
      [memoriaId],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        erro: "Memória não encontrada",
      });
    }

    const memoria = resultado.rows[0];

    if (!memoria.foto) {
      return res.status(404).json({
        erro: "Esta memória não possui foto",
      });
    }

    if (!req.usuario.admin) {
      const vinculo = await pool.query(
        "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [req.usuario.id, memoria.box_id],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }
    }

    res.sendFile(memoria.foto, {
      root: __dirname,
    });
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro interno do servidor",
    });
  }
});

app.get(
  "/api/boxes/:boxId/fotos",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const resultado = await pool.query(
        "SELECT fotos.id, usuarios.nome, usuarios_boxes.papel, fotos.arquivo " +
          "FROM fotos " +
          "JOIN usuarios ON usuarios.id = fotos.usuario_id " +
          "JOIN usuarios_boxes ON usuarios_boxes.usuario_id = usuarios.id " +
          "AND usuarios_boxes.box_id = fotos.box_id " +
          "WHERE fotos.box_id = $1 AND fotos.excluido_em IS NULL " +
          "ORDER BY fotos.criado_em DESC",
        [boxId],
      );

      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);

      res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }
  },
);

app.get("/api/fotos/:id/arquivo", autenticarUsuario, async function (req, res) {
  const fotoId = req.params.id;

  try {
    const resultado = await pool.query(
      "SELECT id, box_id, arquivo FROM fotos WHERE id = $1 AND excluido_em IS NULL",
      [fotoId],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        erro: "Foto não encontrada",
      });
    }

    const foto = resultado.rows[0];

    if (!req.usuario.admin) {
      const vinculo = await pool.query(
        "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [req.usuario.id, foto.box_id],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }
    }

    res.sendFile(foto.arquivo, {
      root: __dirname,
    });
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro interno do servidor",
    });
  }
});

app.get(
  "/api/boxes/:boxId/protagonista",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    try {
      const resultado = await pool.query(
        `SELECT publicacoes_protagonista.id,
                publicacoes_protagonista.titulo,
                publicacoes_protagonista.legenda,
                publicacoes_protagonista.criado_em,
                usuarios.nome AS autor_nome,
                usuarios_boxes.papel AS autor_papel
         FROM publicacoes_protagonista
         JOIN usuarios ON usuarios.id = publicacoes_protagonista.usuario_id
         JOIN usuarios_boxes
           ON usuarios_boxes.usuario_id = publicacoes_protagonista.usuario_id
          AND usuarios_boxes.box_id = publicacoes_protagonista.box_id
         WHERE publicacoes_protagonista.box_id = $1
           AND publicacoes_protagonista.excluido_em IS NULL
         ORDER BY publicacoes_protagonista.criado_em DESC,
                  publicacoes_protagonista.id DESC`,
        [req.params.boxId],
      );
      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: "Não foi possível listar as publicações" });
    }
  },
);

app.get(
  "/api/boxes/:boxId/protagonista/:id/foto",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    try {
      const resultado = await pool.query(
        `SELECT foto FROM publicacoes_protagonista
         WHERE id = $1 AND box_id = $2 AND excluido_em IS NULL`,
        [req.params.id, req.params.boxId],
      );
      if (!resultado.rows.length) {
        return res.status(404).json({ erro: "Publicação não encontrada" });
      }
      res.sendFile(resultado.rows[0].foto, { root: __dirname });
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: "Não foi possível carregar a foto" });
    }
  },
);

app.post(
  "/api/boxes/:boxId/protagonista",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const papel = await obterPapelNaBox(req.usuario.id, req.params.boxId);
    if (!papelPodePublicarNaProtagonista(papel)) {
      return res.status(403).json({ erro: "Você não pode publicar nesta gaveta" });
    }

    protagonistUpload.single("foto")(req, res, async function (erroUpload) {
      if (erroUpload) {
        return res.status(400).json({
          erro:
            erroUpload.code === "LIMIT_FILE_SIZE"
              ? "A imagem deve ter no máximo 10 MB"
              : erroUpload.message,
        });
      }

      const arquivo = req.file;
      let caminhoProcessado = null;
      try {
        const titulo = String(req.body.titulo || "").trim();
        const legenda = String(req.body.legenda || "").trim() || null;
        if (!titulo || !arquivo) {
          if (arquivo?.path && fs.existsSync(arquivo.path)) fs.unlinkSync(arquivo.path);
          return res.status(400).json({ erro: "Título e foto são obrigatórios" });
        }

        const { fileTypeFromFile } = await import("file-type");
        const tipoReal = await fileTypeFromFile(arquivo.path);
        if (!tipoReal || !tipoReal.mime.startsWith("image/")) {
          fs.unlinkSync(arquivo.path);
          return res.status(400).json({ erro: "O arquivo enviado não é uma imagem válida" });
        }

        caminhoProcessado = await processarImagem(arquivo.path);
        const resultado = await pool.query(
          `INSERT INTO publicacoes_protagonista
             (box_id, usuario_id, titulo, legenda, foto)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, titulo, legenda, criado_em`,
          [req.params.boxId, req.usuario.id, titulo, legenda, caminhoProcessado],
        );
        res.status(201).json(resultado.rows[0]);
      } catch (erro) {
        console.error(erro);
        for (const caminho of [arquivo?.path, caminhoProcessado]) {
          if (caminho && fs.existsSync(caminho)) fs.unlinkSync(caminho);
        }
        res.status(500).json({ erro: "Não foi possível publicar" });
      }
    });
  },
);

app.post(
  "/api/boxes/:id/depoimentos",
  autenticarUsuario,
  async function (req, res) {
    const boxId = req.params.id;
    const mensagem = req.body.mensagem;

    try {
      if (!mensagem || mensagem.trim() === "") {
        return res.status(400).json({
          erro: "Mensagem é obrigatória",
        });
      }
      const vinculo = await pool.query(
        `
    SELECT
      usuarios_boxes.papel,
      boxes.data_evento
    FROM usuarios_boxes
    JOIN boxes ON boxes.id = usuarios_boxes.box_id
    WHERE usuarios_boxes.usuario_id = $1
      AND usuarios_boxes.box_id = $2
  `,
        [req.usuario.id, boxId],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }
      const { papel, data_evento } = vinculo.rows[0];

      if (!podeEscreverNaBox(papel, data_evento)) {
        return res.status(403).json({
          erro: "A escrita não está disponível neste momento",
        });
      }
      const resultado = await pool.query(
        "INSERT INTO depoimentos (box_id, usuario_id, mensagem) " +
          "VALUES ($1, $2, $3) RETURNING *",
        [boxId, req.usuario.id, mensagem],
      );
      res.status(201).json(resultado.rows[0]);
    } catch (erro) {
      console.error(erro);

      res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }
  },
);

app.post(
  "/api/boxes/:boxId/memorias",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const vinculo = await pool.query(
        `
        SELECT
          usuarios_boxes.papel,
          boxes.data_evento
        FROM usuarios_boxes
        JOIN boxes ON boxes.id = usuarios_boxes.box_id
        WHERE usuarios_boxes.usuario_id = $1
          AND usuarios_boxes.box_id = $2
      `,
        [req.usuario.id, boxId],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }

      const { papel, data_evento } = vinculo.rows[0];

      if (!podeEscreverNaBox(papel, data_evento)) {
        return res.status(403).json({
          erro: "A escrita não está disponível neste momento",
        });
      }
    } catch (erro) {
      console.error(erro);

      return res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }

    upload.single("foto")(req, res, async function (erroUpload) {
      if (erroUpload) {
        if (erroUpload.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            erro: "A imagem deve ter no máximo 10 MB",
          });
        }

        return res.status(400).json({
          erro: erroUpload.message,
        });
      }

      const titulo = req.body.titulo;
      const texto = req.body.texto;
      const arquivo = req.file;

      try {
        if (!titulo || titulo.trim() === "" || !texto || texto.trim() === "") {
          if (arquivo && fs.existsSync(arquivo.path)) {
            fs.unlinkSync(arquivo.path);
          }

          return res.status(400).json({
            erro: "Título e texto são obrigatórios",
          });
        }

        let caminhoFoto = null;

        if (arquivo) {
          const { fileTypeFromFile } = await import("file-type");
          const tipoReal = await fileTypeFromFile(arquivo.path);

          if (!tipoReal || !tipoReal.mime.startsWith("image/")) {
            fs.unlinkSync(arquivo.path);

            return res.status(400).json({
              erro: "O arquivo enviado não é uma imagem válida",
            });
          }
          const novoCaminho = await processarImagem(arquivo.path);

          arquivo.path = novoCaminho;
          caminhoFoto = novoCaminho;
        }

        const resultado = await pool.query(
          "INSERT INTO memorias (box_id, usuario_id, titulo, texto, foto) " +
            "VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [boxId, req.usuario.id, titulo, texto, caminhoFoto],
        );

        res.status(201).json(resultado.rows[0]);
      } catch (erro) {
        console.error(erro);

        if (arquivo && arquivo.path && fs.existsSync(arquivo.path)) {
          fs.unlinkSync(arquivo.path);
        }

        res.status(500).json({
          erro: "Erro interno do servidor",
        });
      }
    });
  },
);
app.post(
  "/api/boxes/:boxId/fotos",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const vinculo = await pool.query(
        `
        SELECT
          usuarios_boxes.papel,
          boxes.data_evento
        FROM usuarios_boxes
        JOIN boxes ON boxes.id = usuarios_boxes.box_id
        WHERE usuarios_boxes.usuario_id = $1
          AND usuarios_boxes.box_id = $2
      `,
        [req.usuario.id, boxId],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }

      const { papel, data_evento } = vinculo.rows[0];

      if (!podeEscreverNaBox(papel, data_evento)) {
        return res.status(403).json({
          erro: "A escrita não está disponível neste momento",
        });
      }
    } catch (erro) {
      console.error(erro);

      return res.status(500).json({
        erro: "Erro interno do servidor",
      });
    }

    upload.single("foto")(req, res, async function (erroUpload) {
      if (erroUpload) {
        if (erroUpload.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            erro: "A imagem deve ter no máximo 10 MB",
          });
        }

        return res.status(400).json({
          erro: erroUpload.message,
        });
      }

      const arquivo = req.file;

      try {
        if (!arquivo) {
          return res.status(400).json({
            erro: "Foto é obrigatória",
          });
        }

        const { fileTypeFromFile } = await import("file-type");
        const tipoReal = await fileTypeFromFile(arquivo.path);

        if (!tipoReal || !tipoReal.mime.startsWith("image/")) {
          fs.unlinkSync(arquivo.path);

          return res.status(400).json({
            erro: "O arquivo enviado não é uma imagem válida",
          });
        }

        const novoCaminho = await processarImagem(arquivo.path);

        arquivo.path = novoCaminho;

        const resultado = await pool.query(
          "INSERT INTO fotos (box_id, usuario_id, arquivo) " +
            "VALUES ($1, $2, $3) RETURNING *",
          [boxId, req.usuario.id, arquivo.path],
        );

        res.status(201).json(resultado.rows[0]);
      } catch (erro) {
        console.error(erro);

        if (arquivo && arquivo.path && fs.existsSync(arquivo.path)) {
          fs.unlinkSync(arquivo.path);
        }

        res.status(500).json({
          erro: "Erro interno do servidor",
        });
      }
    });
  },
);

async function salvarFotoPerfil(usuarioId, urlFoto) {
  if (!urlFoto) {
    return null;
  }

  const resposta = await fetch(urlFoto);

  if (!resposta.ok) {
    throw new Error(`Erro ao baixar foto do Google: ${resposta.status}`);
  }

  const pastaPerfis = path.join(__dirname, "uploads", "perfis");

  fs.mkdirSync(pastaPerfis, { recursive: true });

  const caminhoArquivo = path.join(pastaPerfis, `usuario-${usuarioId}.jpg`);

  const buffer = Buffer.from(await resposta.arrayBuffer());

  fs.writeFileSync(caminhoArquivo, buffer);

  return `/uploads/perfis/usuario-${usuarioId}.jpg`;
}

app.post("/api/auth/google", async function (req, res) {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ erro: "Credential ausente" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload.email || payload.email_verified === false) {
      return res.status(401).json({ erro: "E-mail do Google não verificado" });
    }
    const usuarioExistente = await pool.query(
      `SELECT id, nome, email
        FROM usuarios
        WHERE oauth_provider = $1 AND oauth_id = $2`,
      ["google", payload.sub],
    );

    let usuario;

    if (usuarioExistente.rows.length === 0) {
      const usuarioMesmoEmail = await pool.query(
        `SELECT id, oauth_provider, oauth_id
         FROM usuarios
         WHERE LOWER(BTRIM(email)) = $1`,
        [normalizarEmail(payload.email)],
      );

      if (usuarioMesmoEmail.rows.length > 0) {
        const cadastro = usuarioMesmoEmail.rows[0];
        if (
          cadastro.oauth_provider &&
          (cadastro.oauth_provider !== "google" || cadastro.oauth_id !== payload.sub)
        ) {
          return res.status(409).json({
            erro: "Este e-mail já está associado a outra identidade",
          });
        }
        const usuarioAtualizado = await pool.query(
          `UPDATE usuarios
           SET nome = $1, email = $2, oauth_provider = 'google', oauth_id = $3
           WHERE id = $4
           RETURNING id, nome, email, foto_perfil`,
          [payload.name, normalizarEmail(payload.email), payload.sub, cadastro.id],
        );
        usuario = usuarioAtualizado.rows[0];
      } else {
        const novoUsuario = await pool.query(
          `INSERT INTO usuarios (nome, email, oauth_provider, oauth_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, nome, email, foto_perfil`,
          [payload.name, normalizarEmail(payload.email), "google", payload.sub],
        );
        usuario = novoUsuario.rows[0];
      }
    } else {
      const usuarioAtualizado = await pool.query(
        `UPDATE usuarios
     SET nome = $1,
         email = $2
     WHERE id = $3
     RETURNING id, nome, email, foto_perfil`,
        [payload.name, normalizarEmail(payload.email), usuarioExistente.rows[0].id],
      );

      usuario = usuarioAtualizado.rows[0];
    }

    try {
      const fotoLocal = await salvarFotoPerfil(usuario.id, payload.picture);

      if (fotoLocal) {
        const fotoAtualizada = await pool.query(
          `UPDATE usuarios
       SET foto_perfil = $1
       WHERE id = $2
       RETURNING id, nome, email, foto_perfil`,
          [fotoLocal, usuario.id],
        );

        usuario = fotoAtualizada.rows[0];
      }
    } catch (erroFoto) {
      console.error("Erro ao atualizar foto de perfil:", erroFoto);
    }
    console.log(usuarioExistente.rows);
    console.log("Usuário Click In Box:", usuario);

    await criarSessaoUsuario(res, usuario.id);

    res.json({
      usuario: usuario,
    });
  } catch (erro) {
    console.error(erro);
    res.status(401).json({ erro: "Token do Google inválido" });
  }
});

app.post("/api/auth/acesso-orientado", async function (req, res) {
  const chaveTentativa = req.ip || req.socket.remoteAddress || "desconhecido";
  const agora = Date.now();
  let controle = tentativasAcessoOrientado.get(chaveTentativa);
  if (!controle || agora - controle.inicio >= ACESSO_ORIENTADO_JANELA_MS) {
    controle = { inicio: agora, falhas: 0 };
    tentativasAcessoOrientado.set(chaveTentativa, controle);
  }
  if (controle.falhas >= ACESSO_ORIENTADO_MAX_TENTATIVAS) {
    return res.status(429).json({
      erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    });
  }

  const codigo = normalizarCodigoOrientado(req.body.codigo);
  if (!/^[A-Z0-9]{12}$/.test(codigo)) {
    controle.falhas += 1;
    return res.status(401).json({ erro: "Código inválido ou expirado" });
  }

  try {
    const resultado = await pool.query(
      `SELECT acessos_orientados.id,
              acessos_orientados.usuario_id,
              acessos_orientados.box_id,
              usuarios.nome,
              usuarios.email
       FROM acessos_orientados
       JOIN usuarios ON usuarios.id = acessos_orientados.usuario_id
       JOIN usuarios_boxes
         ON usuarios_boxes.usuario_id = acessos_orientados.usuario_id
        AND usuarios_boxes.box_id = acessos_orientados.box_id
        AND usuarios_boxes.papel = 'convidado'
       WHERE acessos_orientados.codigo_hash = $1
         AND acessos_orientados.revogado_em IS NULL
         AND acessos_orientados.expira_em > CURRENT_TIMESTAMP`,
      [hashCodigoOrientado(codigo)],
    );
    if (resultado.rows.length === 0) {
      controle.falhas += 1;
      return res.status(401).json({ erro: "Código inválido ou expirado" });
    }

    const acesso = resultado.rows[0];
    await Promise.all([
      criarSessaoUsuario(res, acesso.usuario_id),
      pool.query(
        "UPDATE acessos_orientados SET ultimo_uso_em = CURRENT_TIMESTAMP WHERE id = $1",
        [acesso.id],
      ),
    ]);
    tentativasAcessoOrientado.delete(chaveTentativa);
    res.json({
      usuario: { id: acesso.usuario_id, nome: acesso.nome, email: acesso.email },
      box_id: acesso.box_id,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível realizar o acesso" });
  }
});

app.get("/api/auth/me", autenticarUsuario, async function (req, res) {
  const resultado = await pool.query(
    `
      SELECT id, nome, email, foto_perfil
      FROM usuarios
      WHERE id = $1
    `,
    [req.usuario.id],
  );

  res.json({
    usuario: resultado.rows[0],
  });
});
app.post("/api/auth/logout", async function (req, res) {
  const tokenSessao = obterCookie(req, "clickinbox_session");

  if (tokenSessao) {
    await pool.query(
      `
        DELETE FROM sessoes
        WHERE token = $1
      `,
      [tokenSessao],
    );
  }

  res.clearCookie("clickinbox_session");

  res.json({
    mensagem: "Logout realizado com sucesso",
  });
});

app.get("/api/minhas-boxes", autenticarUsuario, async function (req, res) {
  const resultado = await pool.query(
    `
      SELECT
        boxes.id,
        boxes.nome,
        boxes.evento,
        boxes.imagem_principal,
        usuarios_boxes.papel
      FROM usuarios_boxes
      JOIN boxes ON boxes.id = usuarios_boxes.box_id
      WHERE usuarios_boxes.usuario_id = $1
      ORDER BY boxes.id
    `,
    [req.usuario.id],
  );

  res.json(resultado.rows);
});

app.get(
  "/convite/:token",
  identificarBoxDoConvite,
  autenticarPagina,
  async function (req, res) {
  const token = req.params.token;

  try {
    const resultado = await pool.query(
      `
        SELECT
          convites.id,
          convites.box_id,
          convites.papel,
          convites.limite_usos,
          convites.usos,
          convites.ativo,
          boxes.nome,
          boxes.data_evento
        FROM convites
        JOIN boxes ON boxes.id = convites.box_id
        WHERE convites.token = $1
      `,
      [token],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).send("Convite inválido.");
    }

    const convite = resultado.rows[0];

    const vinculoExistente = await pool.query(
      `
        SELECT usuario_id, box_id, papel
        FROM usuarios_boxes
        WHERE usuario_id = $1 AND box_id = $2
      `,
      [req.usuario.id, convite.box_id],
    );

    if (vinculoExistente.rows.length > 0) {
      return res.redirect(`/boxes/${convite.box_id}`);
    }
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const conviteBloqueado = await client.query(
        `
    SELECT id, limite_usos, usos, ativo
    FROM convites
    WHERE id = $1
    FOR UPDATE
  `,
        [convite.id],
      );
      const estadoConvite = conviteBloqueado.rows[0];
      if (!estadoConvite.ativo) {
        await client.query("ROLLBACK");

        return res
          .status(403)
          .send(
            "Este convite não está mais disponível. Entre em contato com a Click In Box para verificarmos seu acesso.",
          );
      }

      if (
        estadoConvite.limite_usos !== null &&
        estadoConvite.usos >= estadoConvite.limite_usos
      ) {
        await client.query("ROLLBACK");

        return res
          .status(403)
          .send(
            "Este convite já atingiu o limite de acessos. Entre em contato com a mãe da aniversariante ou com a Click In Box para verificarmos seu acesso.",
          );
      }

      await client.query(
        `
      INSERT INTO usuarios_boxes (usuario_id, box_id, papel)
      VALUES ($1, $2, $3)
      RETURNING usuario_id, box_id, papel
    `,
        [req.usuario.id, convite.box_id, convite.papel],
      );

      await client.query(
        `
      UPDATE convites
      SET usos = usos + 1
      WHERE id = $1
    `,
        [convite.id],
      );

      await client.query("COMMIT");
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    } finally {
      client.release();
    }

    return res.redirect(`/boxes/${convite.box_id}`);
  } catch (erro) {
    console.error(erro);

    res.status(500).send("Erro interno do servidor.");
  }
});

const CONVITES_PADRAO = [
  { rotulo: "Protagonista", papel: "protagonista", limite: 1 },
  { rotulo: "Mãe", papel: "mae", limite: 1 },
  { rotulo: "Pai", papel: "pai", limite: 1 },
  { rotulo: "As 15", papel: "coautora", limite: 15 },
  { rotulo: "Cerimonialista", papel: "cerimonialista", limite: 1 },
  { rotulo: "Convidados", papel: "convidado", limite: 500 },
];

function limparUploadsTemporarios(req) {
  for (const arquivos of Object.values(req.files || {})) {
    for (const arquivo of arquivos) {
      fs.rmSync(arquivo.path, { force: true });
    }
  }
}

function caminhoPublicoBox(boxId, nome) {
  return `/uploads/boxes/${boxId}/${nome}`;
}

function caminhoFisicoPublico(caminhoPublico) {
  if (!caminhoPublico?.startsWith("/uploads/")) return null;
  const relativo = caminhoPublico.replace(/^\/+/, "");
  const absoluto = path.resolve(__dirname, relativo);
  const raiz = path.resolve(__dirname, "uploads") + path.sep;
  return absoluto.startsWith(raiz) ? absoluto : null;
}

function removerArquivoPublico(caminhoPublico) {
  const caminho = caminhoFisicoPublico(caminhoPublico);
  if (caminho) fs.rmSync(caminho, { force: true });
}

async function validarArquivo(caminho, tipos, mensagem) {
  const { fileTypeFromFile } = await import("file-type");
  const tipo = await fileTypeFromFile(caminho);
  if (!tipo || !tipos.includes(tipo.mime)) throw new Error(mensagem);
  return tipo;
}

async function prepararArquivosBox(req, boxId) {
  const preparados = {};
  const criados = [];
  const pasta = path.join(__dirname, "uploads", "boxes", String(boxId));
  fs.mkdirSync(pasta, { recursive: true });
  const sufixo = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;

  try {
    const hero = req.files?.imagem_principal?.[0];
    if (hero) {
      const tipo = await validarArquivo(
        hero.path,
        ["image/jpeg", "image/png", "image/webp", "image/avif"],
        "A foto principal deve ser JPEG, PNG, WebP ou AVIF",
      );
      const original = `hero-original-${sufixo}.${tipo.ext}`;
      const otimizada = `hero-${sufixo}.jpg`;
      const caminhoOriginal = path.join(pasta, original);
      const caminhoOtimizada = path.join(pasta, otimizada);
      fs.renameSync(hero.path, caminhoOriginal);
      criados.push(caminhoOriginal);
      await sharp(caminhoOriginal)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toFile(caminhoOtimizada);
      criados.push(caminhoOtimizada);
      preparados.imagem_principal_original = caminhoPublicoBox(boxId, original);
      preparados.imagem_principal = caminhoPublicoBox(boxId, otimizada);
    }

    const arte = req.files?.apresentacao_imagem?.[0];
    if (arte) {
      const tipo = await validarArquivo(
        arte.path,
        ["image/png", "image/webp"],
        "A arte deve ser PNG ou WebP com transparência",
      );
      const metadata = await sharp(arte.path).metadata();
      if ((metadata.width || 0) > 5000 || (metadata.height || 0) > 5000) {
        throw new Error("A arte pode ter no máximo 5000 × 5000 pixels");
      }
      const nome = `apresentacao-${sufixo}.${tipo.ext}`;
      const destino = path.join(pasta, nome);
      fs.renameSync(arte.path, destino);
      criados.push(destino);
      preparados.apresentacao_imagem = caminhoPublicoBox(boxId, nome);
    }

    const musica = req.files?.musica?.[0];
    if (musica) {
      if (musica.size > 25 * 1024 * 1024) throw new Error("O MP3 pode ter no máximo 25 MB");
      await validarArquivo(musica.path, ["audio/mpeg"], "A música deve ser um arquivo MP3 válido");
      const nome = `musica-${sufixo}.mp3`;
      const destino = path.join(pasta, nome);
      fs.renameSync(musica.path, destino);
      criados.push(destino);
      preparados.musica = caminhoPublicoBox(boxId, nome);
    }
    limparUploadsTemporarios(req);
    return { preparados, criados };
  } catch (erro) {
    limparUploadsTemporarios(req);
    criados.forEach((arquivo) => fs.rmSync(arquivo, { force: true }));
    throw erro;
  }
}

function lerDadosBox(body) {
  const nome = String(body.nome || "").trim();
  const evento = String(body.evento || "").trim();
  const dataEvento = String(body.data_evento || "").trim();
  const apresentacaoTipo = body.apresentacao_tipo === "imagem" ? "imagem" : "texto";
  const cor = String(body.cor_ambientacao || "").trim() || null;
  const visivelHome = body.visivel_home === "on" || body.visivel_home === "true" || body.visivel_home === true;
  const semEnquadramento = body.imagem_foco_x === undefined && body.imagem_foco_y === undefined && body.imagem_zoom === undefined;
  const focoX = semEnquadramento ? null : Number(body.imagem_foco_x);
  const focoY = semEnquadramento ? null : Number(body.imagem_foco_y);
  const zoom = semEnquadramento ? null : Number(body.imagem_zoom);
  if (!nome || !evento || !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento)) {
    throw new Error("Nome, evento e data do evento são obrigatórios");
  }
  if (cor && !/^#[0-9a-f]{6}$/i.test(cor)) throw new Error("Cor de ambientação inválida");
  if (!semEnquadramento && !(focoX >= 0 && focoX <= 100 && focoY >= 0 && focoY <= 100 && zoom >= 1 && zoom <= 3)) {
    throw new Error("Enquadramento da foto inválido");
  }
  return { nome, evento, dataEvento, apresentacaoTipo, cor, focoX, focoY, zoom, visivelHome };
}

app.get("/api/admin/boxes", autenticarUsuario, autorizarAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT boxes.*, EXISTS (
         SELECT 1 FROM usuarios_boxes
         WHERE usuario_id = $1 AND box_id = boxes.id AND papel = 'adm'
       ) AS participando_adm
       FROM boxes ORDER BY boxes.id DESC`,
      [req.usuario.id],
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível listar as Boxes" });
  }
  },
);

app.get("/api/boxes/:boxId/permissoes", autenticarUsuario, async function (req, res) {
  try {
    const papel = await obterPapelNaBox(req.usuario.id, req.params.boxId);
    res.json({
      papel,
      pode_moderar_publicacoes: papelPodeModerarPublicacoes(papel),
      pode_publicar_protagonista: papelPodePublicarNaProtagonista(papel),
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível verificar as permissões" });
  }
});

app.get("/api/admin/boxes/:id", autenticarUsuario, autorizarAdmin, async (req, res) => {
  try {
    const [box, convites, vinculo] = await Promise.all([
      pool.query("SELECT * FROM boxes WHERE id = $1", [req.params.id]),
      pool.query("SELECT id, papel, token, limite_usos, usos, ativo FROM convites WHERE box_id = $1 ORDER BY id", [req.params.id]),
      pool.query("SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2 AND papel = 'adm'", [req.usuario.id, req.params.id]),
    ]);
    if (!box.rows.length) return res.status(404).json({ erro: "Box não encontrada" });
    res.json({ box: box.rows[0], convites: convites.rows, participando_adm: Boolean(vinculo.rows.length) });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível carregar a Box" });
  }
});

app.get(
  "/api/admin/boxes/:id/acessos-orientados",
  autenticarUsuario,
  autorizarAdmin,
  async (req, res) => {
    try {
      const resultado = await pool.query(
        `SELECT acessos_orientados.id,
                usuarios.nome,
                usuarios.email,
                acessos_orientados.expira_em,
                acessos_orientados.revogado_em,
                acessos_orientados.criado_em,
                acessos_orientados.ultimo_uso_em
         FROM acessos_orientados
         JOIN usuarios ON usuarios.id = acessos_orientados.usuario_id
         WHERE acessos_orientados.box_id = $1
         ORDER BY acessos_orientados.criado_em DESC`,
        [req.params.id],
      );
      res.json(resultado.rows);
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: "Não foi possível listar os acessos orientados" });
    }
  },
);

app.post(
  "/api/admin/boxes/:id/acessos-orientados",
  autenticarUsuario,
  autorizarAdmin,
  async (req, res) => {
    const nome = String(req.body.nome || "").trim();
    const email = normalizarEmail(req.body.email);
    if (!nome || nome.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: "Informe nome e e-mail válidos" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const box = await client.query("SELECT id FROM boxes WHERE id = $1", [req.params.id]);
      if (!box.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Box não encontrada" });
      }

      let usuario = await client.query(
        "SELECT id, nome, email FROM usuarios WHERE LOWER(BTRIM(email)) = $1 FOR UPDATE",
        [email],
      );
      if (!usuario.rows.length) {
        usuario = await client.query(
          `INSERT INTO usuarios (nome, email, oauth_provider, oauth_id)
           VALUES ($1, $2, NULL, NULL)
           RETURNING id, nome, email`,
          [nome, email],
        );
      }
      const pessoa = usuario.rows[0];
      const vinculo = await client.query(
        "SELECT papel FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [pessoa.id, req.params.id],
      );
      if (vinculo.rows.length && vinculo.rows[0].papel !== "convidado") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          erro: "Este usuário já possui outro papel nesta Box",
        });
      }
      if (!vinculo.rows.length) {
        await client.query(
          "INSERT INTO usuarios_boxes (usuario_id, box_id, papel) VALUES ($1, $2, 'convidado')",
          [pessoa.id, req.params.id],
        );
      }
      await client.query(
        `UPDATE acessos_orientados
         SET revogado_em = CURRENT_TIMESTAMP
         WHERE usuario_id = $1 AND box_id = $2 AND revogado_em IS NULL`,
        [pessoa.id, req.params.id],
      );
      const acesso = await criarRegistroAcessoOrientado(
        client,
        req.params.id,
        pessoa.id,
        req.usuario.id,
      );
      await client.query("COMMIT");
      res.status(201).json({
        id: acesso.id,
        nome: pessoa.nome,
        email: pessoa.email,
        codigo: acesso.codigo,
        expira_em: acesso.expira_em,
      });
    } catch (erro) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(erro);
      res.status(400).json({ erro: "Não foi possível criar o acesso orientado" });
    } finally {
      client.release();
    }
  },
);

app.post(
  "/api/admin/boxes/:boxId/acessos-orientados/:id/regenerar",
  autenticarUsuario,
  autorizarAdmin,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const atual = await client.query(
        `SELECT usuario_id FROM acessos_orientados
         WHERE id = $1 AND box_id = $2 FOR UPDATE`,
        [req.params.id, req.params.boxId],
      );
      if (!atual.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Acesso orientado não encontrado" });
      }
      await client.query(
        `UPDATE acessos_orientados SET revogado_em = CURRENT_TIMESTAMP
         WHERE usuario_id = $1 AND box_id = $2 AND revogado_em IS NULL`,
        [atual.rows[0].usuario_id, req.params.boxId],
      );
      const acesso = await criarRegistroAcessoOrientado(
        client,
        req.params.boxId,
        atual.rows[0].usuario_id,
        req.usuario.id,
      );
      await client.query("COMMIT");
      res.json({ id: acesso.id, codigo: acesso.codigo, expira_em: acesso.expira_em });
    } catch (erro) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(erro);
      res.status(400).json({ erro: "Não foi possível regenerar o acesso" });
    } finally {
      client.release();
    }
  },
);

app.delete(
  "/api/admin/boxes/:boxId/acessos-orientados/:id",
  autenticarUsuario,
  autorizarAdmin,
  async (req, res) => {
    try {
      const resultado = await pool.query(
        `UPDATE acessos_orientados SET revogado_em = CURRENT_TIMESTAMP
         WHERE id = $1 AND box_id = $2 AND revogado_em IS NULL RETURNING id`,
        [req.params.id, req.params.boxId],
      );
      if (!resultado.rows.length) {
        return res.status(404).json({ erro: "Acesso orientado não encontrado ou já revogado" });
      }
      res.status(204).end();
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: "Não foi possível revogar o acesso" });
    }
  },
);

function excluirPublicacaoLogicamente(tabela, nomePublicacao) {
  return async function (req, res) {
    const { boxId, id } = req.params;

    try {
      const publicacao = await pool.query(
        `SELECT id FROM ${tabela} WHERE id = $1 AND box_id = $2 AND excluido_em IS NULL`,
        [id, boxId],
      );
      if (!publicacao.rows.length) {
        return res.status(404).json({ erro: `${nomePublicacao} não encontrada` });
      }

      const papel = await obterPapelNaBox(req.usuario.id, boxId);
      if (!papelPodeModerarPublicacoes(papel)) {
        return res.status(403).json({ erro: "Você não pode excluir publicações desta Box" });
      }

      const resultado = await pool.query(
        `UPDATE ${tabela}
         SET excluido_em = CURRENT_TIMESTAMP, excluido_por = $1
         WHERE id = $2 AND box_id = $3 AND excluido_em IS NULL
         RETURNING id`,
        [req.usuario.id, id, boxId],
      );
      if (!resultado.rows.length) {
        return res.status(404).json({ erro: `${nomePublicacao} não encontrada` });
      }

      res.status(204).end();
    } catch (erro) {
      console.error(erro);
      res.status(500).json({ erro: "Não foi possível excluir a publicação" });
    }
  };
}

app.delete(
  "/api/boxes/:boxId/depoimentos/:id",
  autenticarUsuario,
  excluirPublicacaoLogicamente("depoimentos", "Depoimento"),
);

app.delete(
  "/api/boxes/:boxId/memorias/:id",
  autenticarUsuario,
  excluirPublicacaoLogicamente("memorias", "Memória"),
);
app.delete(
  "/api/boxes/:boxId/fotos/:id",
  autenticarUsuario,
  excluirPublicacaoLogicamente("fotos", "Foto"),
);
app.delete(
  "/api/boxes/:boxId/protagonista/:id",
  autenticarUsuario,
  excluirPublicacaoLogicamente("publicacoes_protagonista", "Publicação"),
);

app.post(
  "/api/admin/boxes",
  autenticarUsuario,
  autorizarAdmin,
  adminUpload.fields([
    { name: "imagem_principal", maxCount: 1 },
    { name: "apresentacao_imagem", maxCount: 1 },
    { name: "musica", maxCount: 1 },
  ]),
  async (req, res) => {
    let client;
    let criados = [];
    let boxId;
    try {
      const dados = lerDadosBox(req.body);
      if (!dados.cor) throw new Error("Escolha a cor de ambientação da Box");
      if (dados.focoX === null) throw new Error("Defina o enquadramento da foto principal");
      if (!req.files?.imagem_principal?.[0] || !req.files?.musica?.[0]) {
        throw new Error("Foto principal e música são obrigatórias na criação");
      }
      if (dados.apresentacaoTipo === "imagem" && !req.files?.apresentacao_imagem?.[0]) {
        throw new Error("Envie a arte da apresentação");
      }
      client = await pool.connect();
      await client.query("BEGIN");
      const insercao = await client.query(
        `INSERT INTO boxes (nome, evento, data_evento, apresentacao_tipo,
          imagem_foco_x, imagem_foco_y, imagem_zoom, cor_ambientacao, visivel_home)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [dados.nome, dados.evento, dados.dataEvento, dados.apresentacaoTipo, dados.focoX, dados.focoY, dados.zoom, dados.cor, dados.visivelHome],
      );
      boxId = insercao.rows[0].id;
      const arquivos = await prepararArquivosBox(req, boxId);
      criados = arquivos.criados;
      const p = arquivos.preparados;
      await client.query(
        "UPDATE boxes SET imagem_principal=$1, imagem_principal_original=$2, apresentacao_imagem=$3, musica=$4 WHERE id=$5",
        [p.imagem_principal, p.imagem_principal_original, p.apresentacao_imagem || null, p.musica, boxId],
      );
      for (const convite of CONVITES_PADRAO) {
        await criarConvite(boxId, convite.papel, convite.limite, client);
      }
      await client.query("COMMIT");
      res.status(201).json({ id: boxId });
    } catch (erro) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      criados.forEach((arquivo) => fs.rmSync(arquivo, { force: true }));
      limparUploadsTemporarios(req);
      console.error(erro);
      res.status(400).json({ erro: erro.message || "Não foi possível criar a Box" });
    } finally {
      client?.release();
    }
  },
);

app.put(
  "/api/admin/boxes/:id",
  autenticarUsuario,
  autorizarAdmin,
  adminUpload.fields([
    { name: "imagem_principal", maxCount: 1 },
    { name: "apresentacao_imagem", maxCount: 1 },
    { name: "musica", maxCount: 1 },
  ]),
  async (req, res) => {
    let novos = [];
    try {
      const dados = lerDadosBox(req.body);
      const atual = await pool.query("SELECT * FROM boxes WHERE id=$1", [req.params.id]);
      if (!atual.rows.length) throw new Error("Box não encontrada");
      const arquivos = await prepararArquivosBox(req, req.params.id);
      novos = arquivos.criados;
      const p = arquivos.preparados;
      if (dados.apresentacaoTipo === "imagem" && !(p.apresentacao_imagem || atual.rows[0].apresentacao_imagem)) {
        throw new Error("Envie a arte da apresentação");
      }
      const resultado = await pool.query(
        `UPDATE boxes SET nome=$1, evento=$2, data_evento=$3, apresentacao_tipo=$4,
          imagem_foco_x=$5, imagem_foco_y=$6, imagem_zoom=$7, cor_ambientacao=$8,
          imagem_principal=COALESCE($9,imagem_principal),
          imagem_principal_original=COALESCE($10,imagem_principal_original),
          apresentacao_imagem=COALESCE($11,apresentacao_imagem),
          musica=COALESCE($12,musica), visivel_home=$13
         WHERE id=$14 RETURNING *`,
        [dados.nome,dados.evento,dados.dataEvento,dados.apresentacaoTipo,dados.focoX,dados.focoY,dados.zoom,dados.cor,
          p.imagem_principal||null,p.imagem_principal_original||null,p.apresentacao_imagem||null,p.musica||null,dados.visivelHome,req.params.id],
      );
      const anterior = atual.rows[0];
      if (p.imagem_principal) {
        try { removerArquivoPublico(anterior.imagem_principal); } catch (erroArquivo) { console.error("Falha ao remover foto substituída", erroArquivo); }
        try { removerArquivoPublico(anterior.imagem_principal_original); } catch (erroArquivo) { console.error("Falha ao remover original substituído", erroArquivo); }
      }
      if (p.apresentacao_imagem) {
        try { removerArquivoPublico(anterior.apresentacao_imagem); } catch (erroArquivo) { console.error("Falha ao remover arte substituída", erroArquivo); }
      }
      if (p.musica) {
        try { removerArquivoPublico(anterior.musica); } catch (erroArquivo) { console.error("Falha ao remover música substituída", erroArquivo); }
      }
      res.json(resultado.rows[0]);
    } catch (erro) {
      novos.forEach((arquivo) => fs.rmSync(arquivo, { force: true }));
      limparUploadsTemporarios(req);
      console.error(erro);
      res.status(400).json({ erro: erro.message || "Não foi possível editar a Box" });
    }
  },
);

app.post("/api/admin/boxes/:id/participacao", autenticarUsuario, autorizarAdmin, async (req, res) => {
  try {
    const atual = await pool.query("SELECT papel FROM usuarios_boxes WHERE usuario_id=$1 AND box_id=$2", [req.usuario.id, req.params.id]);
    if (atual.rows.length && atual.rows[0].papel !== "adm") {
      return res.status(409).json({ erro: "Você já participa desta Box com outro papel" });
    }
    await pool.query(
      "INSERT INTO usuarios_boxes (usuario_id,box_id,papel) VALUES ($1,$2,'adm') ON CONFLICT (usuario_id,box_id) DO NOTHING",
      [req.usuario.id, req.params.id],
    );
    res.status(201).json({ mensagem: "Participação ADM ativa" });
  } catch (erro) {
    console.error(erro);
    res.status(400).json({ erro: "Não foi possível ativar a participação ADM" });
  }
});

app.delete("/api/admin/boxes/:id/participacao", autenticarUsuario, autorizarAdmin, async (req, res) => {
  const conteudo = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM fotos WHERE box_id=$1 AND usuario_id=$2) +
      (SELECT COUNT(*) FROM memorias WHERE box_id=$1 AND usuario_id=$2) +
      (SELECT COUNT(*) FROM depoimentos WHERE box_id=$1 AND usuario_id=$2) AS total`,
    [req.params.id, req.usuario.id],
  );
  if (Number(conteudo.rows[0].total) > 0) {
    return res.status(409).json({ erro: "Limpe seu conteúdo de demonstração antes de remover a participação ADM" });
  }
  await pool.query("DELETE FROM usuarios_boxes WHERE usuario_id=$1 AND box_id=$2 AND papel='adm'", [req.usuario.id, req.params.id]);
  res.json({ mensagem: "Participação ADM removida" });
});

app.delete("/api/admin/boxes/:id/conteudo-proprio", autenticarUsuario, autorizarAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fotos = await client.query("DELETE FROM fotos WHERE box_id=$1 AND usuario_id=$2 RETURNING arquivo", [req.params.id, req.usuario.id]);
    const memorias = await client.query("DELETE FROM memorias WHERE box_id=$1 AND usuario_id=$2 RETURNING foto", [req.params.id, req.usuario.id]);
    const depoimentos = await client.query("DELETE FROM depoimentos WHERE box_id=$1 AND usuario_id=$2 RETURNING id", [req.params.id, req.usuario.id]);
    await client.query("COMMIT");
    const candidatos = [...fotos.rows.map((r) => r.arquivo), ...memorias.rows.map((r) => r.foto)].filter(Boolean);
    for (const arquivo of candidatos) {
      const referencias = await pool.query(
        "SELECT (SELECT COUNT(*) FROM fotos WHERE arquivo=$1) + (SELECT COUNT(*) FROM memorias WHERE foto=$1) AS total",
        [arquivo],
      );
      if (Number(referencias.rows[0].total) === 0) {
        try { removerArquivoPublico(arquivo); } catch (erroArquivo) { console.error("Falha ao remover arquivo sem referência", erroArquivo); }
      }
    }
    res.json({ removidos: { fotos: fotos.rowCount, memorias: memorias.rowCount, depoimentos: depoimentos.rowCount } });
  } catch (erro) {
    await client.query("ROLLBACK");
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível limpar seu conteúdo" });
  } finally {
    client.release();
  }
});

app.use((erro, req, res, next) => {
  if (!(erro instanceof multer.MulterError)) return next(erro);
  limparUploadsTemporarios(req);
  res.status(400).json({ erro: erro.code === "LIMIT_FILE_SIZE" ? "Arquivo acima do limite de 30 MB" : erro.message });
});

app.listen(PORT, function () {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
