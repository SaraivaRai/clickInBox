require("dotenv").config({ override: true });
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const fs = require("fs");

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

app.use(express.json());
app.use("/css", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));
app.use("/assets", express.static(__dirname + "/assets"));

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

async function autenticarUsuario(req, res, next) {
  const tokenSessao = obterCookie(req, "clickinbox_session");

  if (!tokenSessao) {
    return res.status(401).json({ erro: "Usuário não autenticado" });
  }

  const resultado = await pool.query(
    `SELECT usuario_id, expira_em
     FROM sessoes
     WHERE token = $1
       AND expira_em > CURRENT_TIMESTAMP`,
    [tokenSessao],
  );

  if (resultado.rows.length === 0) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada" });
  }

  req.usuario = {
    id: resultado.rows[0].usuario_id,
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

  return autenticarUsuario(req, res, next);
}

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
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
      "SELECT usuarios.id, usuarios.nome, usuarios_boxes.papel FROM usuarios " +
        "JOIN usuarios_boxes ON usuarios.id = usuarios_boxes.usuario_id " +
        "JOIN boxes ON boxes.id = usuarios_boxes.box_id " +
        "WHERE boxes.id = $1",
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
      "SELECT depoimentos.id, usuarios.nome, usuarios_boxes.papel, depoimentos.mensagem " +
        "FROM depoimentos " +
        "JOIN usuarios ON usuarios.id = depoimentos.usuario_id " +
        "JOIN usuarios_boxes ON usuarios_boxes.usuario_id = usuarios.id " +
        "AND usuarios_boxes.box_id = depoimentos.box_id " +
        "WHERE depoimentos.box_id = $1",
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
        "WHERE memorias.box_id = $1",
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
  "/api/memorias/:id/foto",
  autenticarUsuario,
  async function (req, res) {
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

    const vinculo = await pool.query(
      "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
      [req.usuario.id, memoria.box_id],
    );

    if (vinculo.rows.length === 0) {
      return res.status(403).json({
        erro: "Usuário não pertence a esta Box",
      });
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
        "WHERE fotos.box_id = $1",
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
  "/api/fotos/:id/arquivo",
  autenticarUsuario,
  async function (req, res) {
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

    const vinculo = await pool.query(
      "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
      [req.usuario.id, foto.box_id],
    );

    if (vinculo.rows.length === 0) {
      return res.status(403).json({
        erro: "Usuário não pertence a esta Box",
      });
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
        "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [req.usuario.id, boxId],
      );

      if (vinculo.rows.length === 0) {
        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
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
  function (req, res) {
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

    const boxId = req.params.boxId;
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
});
app.post(
  "/api/boxes/:boxId/fotos",
  autenticarUsuario,
  autorizarBox,
  function (req, res) {
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

    const boxId = req.params.boxId;
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
});

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
     RETURNING id, nome, email`,
        [payload.name, payload.email, "google", payload.sub],
      );

      usuario = novoUsuario.rows[0];
    } else {
      usuario = usuarioExistente.rows[0];
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

app.get("/api/auth/me", autenticarUsuario, function (req, res) {
  res.json({
    usuario: req.usuario,
  });
});

app.listen(PORT, function () {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
