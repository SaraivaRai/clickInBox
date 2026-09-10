require("dotenv").config({ override: true });
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const fs = require("fs");
const path = require("path");

const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const DIAS_ANTES_ESCRITA_CONVIDADO = 1;
const DIAS_DEPOIS_ESCRITA = 5;

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }

    cb(new Error("Apenas imagens são permitidas"));
  },
});

const app = express();
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

async function criarConvite(boxId, papel, limiteUsos) {
  const token = gerarTokenConvite();

  const resultado = await pool.query(
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

async function autenticarPagina(req, res, next) {
  const tokenSessao = obterCookie(req, "clickinbox_session");

  if (!tokenSessao) {
    return res.redirect(
      `/login.html?retorno=${encodeURIComponent(req.originalUrl)}`,
    );
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

    return res.redirect(
      `/login.html?retorno=${encodeURIComponent(req.originalUrl)}`,
    );
  }

  return autenticarUsuario(req, res, next);
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

app.get("/api/status", function (req, res) {
  res.json({
    status: "ok",
    projeto: "Click In Box",
  });
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
          "WHERE boxes.id = $1 " +
          "ORDER BY " +
          "CASE usuarios_boxes.papel " +
          "WHEN 'protagonista' THEN 1 " +
          "WHEN 'mae' THEN 2 " +
          "WHEN 'pai' THEN 3 " +
          "WHEN 'coautora' THEN 4 " +
          "WHEN 'convidado' THEN 5 " +
          "ELSE 6 END, " +
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

app.get(
  "/api/boxes/:boxId/depoimentos",
  autenticarUsuario,
  autorizarBox,
  async function (req, res) {
    const boxId = req.params.boxId;

    try {
      const resultado = await pool.query(
        "SELECT depoimentos.id, usuarios.nome, usuarios_boxes.papel, depoimentos.mensagem " +
          "FROM depoimentos " +
          "JOIN usuarios ON usuarios.id = depoimentos.usuario_id " +
          "JOIN usuarios_boxes ON usuarios_boxes.usuario_id = usuarios.id " +
          "AND usuarios_boxes.box_id = depoimentos.box_id " +
          "WHERE depoimentos.box_id = $1 " +
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
          "WHERE memorias.box_id = $1 " +
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
      "SELECT id, box_id, foto FROM memorias WHERE id = $1",
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
          "WHERE fotos.box_id = $1 " +
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
      "SELECT id, box_id, arquivo FROM fotos WHERE id = $1",
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

          const novoCaminho = arquivo.path + "." + tipoReal.ext;

          fs.renameSync(arquivo.path, novoCaminho);
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

        const novoCaminho = arquivo.path + "." + tipoReal.ext;

        fs.renameSync(arquivo.path, novoCaminho);
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
    const usuarioExistente = await pool.query(
      `SELECT id, nome, email
        FROM usuarios
        WHERE oauth_provider = $1 AND oauth_id = $2`,
      ["google", payload.sub],
    );

    let usuario;

    if (usuarioExistente.rows.length === 0) {
      const novoUsuario = await pool.query(
        `INSERT INTO usuarios (nome, email, oauth_provider, oauth_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, foto_perfil`,
        [payload.name, payload.email, "google", payload.sub],
      );

      usuario = novoUsuario.rows[0];
    } else {
      const usuarioAtualizado = await pool.query(
        `UPDATE usuarios
     SET nome = $1,
         email = $2
     WHERE id = $3
     RETURNING id, nome, email, foto_perfil`,
        [payload.name, payload.email, usuarioExistente.rows[0].id],
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

    const tokenSessao = crypto.randomBytes(32).toString("hex");

    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + 20);

    await pool.query(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
   VALUES ($1, $2, $3)`,
      [tokenSessao, usuario.id, expiraEm],
    );

    console.log("Sessão Click In Box criada");

    const cookieSeguro = process.env.NODE_ENV === "production";

    res.cookie("clickinbox_session", tokenSessao, {
      httpOnly: true,
      secure: cookieSeguro,
      sameSite: "lax",
      maxAge: 20 * 24 * 60 * 60 * 1000,
    });

    res.json({
      usuario: usuario,
    });
  } catch (erro) {
    console.error(erro);
    res.status(401).json({ erro: "Token do Google inválido" });
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

app.get("/convite/:token", autenticarPagina, async function (req, res) {
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

app.listen(PORT, function () {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
