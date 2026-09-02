require("dotenv").config({ override: true });

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
app.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});
app.get("/box.html", function (req, res) {
  res.sendFile(__dirname + "/box.html");
});
app.get("/album.html", function (req, res) {
  res.sendFile(__dirname + "/album.html");
});
app.get("/depoimentos.html", function (req, res) {
  res.sendFile(__dirname + "/depoimentos.html");
});
app.get("/memorias.html", function (req, res) {
  res.sendFile(__dirname + "/memorias.html");
});
app.get("/pessoas.html", function (req, res) {
  res.sendFile(__dirname + "/pessoas.html");
});

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

app.get("/api/boxes/:id/usuarios", async function (req, res) {
  const boxId = req.params.id;

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

app.get("/api/boxes/:id/depoimentos", async function (req, res) {
  const boxId = req.params.id;

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

app.get("/api/boxes/:id/memorias", async function (req, res) {
  const boxId = req.params.id;

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
app.get("/api/memorias/:id/foto", async function (req, res) {
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
      [1, memoria.box_id],
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

app.get("/api/boxes/:id/fotos", async function (req, res) {
  const boxId = req.params.id;

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

app.get("/api/fotos/:id/arquivo", async function (req, res) {
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
      [1, foto.box_id],
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

app.post("/api/boxes/:id/depoimentos", async function (req, res) {
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
      [1, boxId],
    );

    if (vinculo.rows.length === 0) {
      return res.status(403).json({
        erro: "Usuário não pertence a esta Box",
      });
    }
    const resultado = await pool.query(
      "INSERT INTO depoimentos (box_id, usuario_id, mensagem) " +
        "VALUES ($1, $2, $3) RETURNING *",
      [boxId, 1, mensagem],
    );
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro interno do servidor",
    });
  }
});

app.post("/api/boxes/:id/memorias", function (req, res) {
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

    const boxId = req.params.id;
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

      const vinculo = await pool.query(
        "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [1, boxId],
      );

      if (vinculo.rows.length === 0) {
        if (arquivo && fs.existsSync(arquivo.path)) {
          fs.unlinkSync(arquivo.path);
        }

        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
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
        [boxId, 1, titulo, texto, caminhoFoto],
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
app.post("/api/boxes/:id/fotos", function (req, res) {
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

    const boxId = req.params.id;
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
      const vinculo = await pool.query(
        "SELECT 1 FROM usuarios_boxes WHERE usuario_id = $1 AND box_id = $2",
        [1, boxId],
      );

      if (vinculo.rows.length === 0) {
        fs.unlinkSync(arquivo.path);

        return res.status(403).json({
          erro: "Usuário não pertence a esta Box",
        });
      }

      const resultado = await pool.query(
        "INSERT INTO fotos (box_id, usuario_id, arquivo) " +
          "VALUES ($1, $2, $3) RETURNING *",
        [boxId, 1, arquivo.path],
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

app.listen(PORT, function () {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
