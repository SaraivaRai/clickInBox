require("dotenv").config({ override: true });

const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

app.use(express.static(__dirname));

app.listen(PORT, function () {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

app.get("/api/status", function (req, res) {
    res.json({
        status: "ok",
        projeto: "Click In Box"
    });
});

app.get("/api/boxes/:id", async function (req, res) {
    const boxId = req.params.id;
    
    try{
    const resultado = await pool.query(
        "SELECT * FROM boxes WHERE id = $1",
        [boxId]
    );
    if (resultado.rows.length === 0) {
    return res.status(404).json({
        erro: "Box não encontrada"
    });
}
    res.json(resultado.rows[0]);
}catch (erro) {
    console.error(erro);

    res.status(500).json({
        erro: "Erro interno do servidor"
    });
}
});


app.listen(PORT, function () {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});