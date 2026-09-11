const memoryTitle = document.querySelector("#memory-title");

if (memoryTitle) {
  memoryTitle.addEventListener("change", function () {
    const customTitle = document.querySelector("#memory-custom-title");

    if (memoryTitle.value === "outro") {
      customTitle.style.display = "block";
      customTitle.focus();
    } else {
      customTitle.style.display = "none";
      customTitle.value = "";
    }
  });
}

const partesUrl = window.location.pathname.split("/");
const boxId = partesUrl[1] === "boxes" ? partesUrl[2] : null;

const linkAlbum = document.querySelector("#link-album");
const linkDepoimentos = document.querySelector("#link-depoimentos");
const linkPessoas = document.querySelector("#link-pessoas");
const linkMemorias = document.querySelector("#link-memorias");
const boxReturn = document.querySelector("#box-return");

if (boxId) {
  if (linkAlbum) linkAlbum.href = `/boxes/${boxId}/album`;
  if (linkDepoimentos) linkDepoimentos.href = `/boxes/${boxId}/depoimentos`;
  if (linkPessoas) linkPessoas.href = `/boxes/${boxId}/pessoas`;
  if (linkMemorias) linkMemorias.href = `/boxes/${boxId}/memorias`;
  if (boxReturn) boxReturn.href = `/boxes/${boxId}`;
}

async function carregarBox() {
  if (!boxId) return;

  const resposta = await fetch(`/api/boxes/${boxId}`);
  const box = await resposta.json();
  const boxNome = document.querySelector("#box-nome");
  const boxEvento = document.querySelector("#box-evento");
  const boxImagemPrincipal = document.querySelector("#box-imagem-principal");
  const boxMusica = document.querySelector("#box-musica");
  const boxMusicaSource = document.querySelector("#box-musica-source");

  if (boxNome) boxNome.textContent = box.nome;
  if (boxEvento) boxEvento.textContent = box.evento;

  if (boxImagemPrincipal) {
    boxImagemPrincipal.src = box.imagem_principal;
    boxImagemPrincipal.alt = `${box.nome} - ${box.evento}`;
  }
  if (boxMusica && boxMusicaSource) {
    boxMusicaSource.src = box.musica;
    boxMusica.load();
  }
}

carregarBox();

async function carregarFotos() {
  const albumGrid = document.querySelector(".album-grid");

  if (!albumGrid) {
    return;
  }

  albumGrid.innerHTML = "";

  const resposta = await fetch(`/api/boxes/${boxId}/fotos`);
  const fotos = await resposta.json();

  fotos.forEach(function (foto) {
    const link = document.createElement("a");
    link.href = `/api/fotos/${foto.id}/arquivo`;
    link.target = "_blank";

    const imagem = document.createElement("img");
    imagem.src = `/api/fotos/${foto.id}/arquivo`;
    imagem.alt = `Foto compartilhada por ${foto.nome}`;

    link.appendChild(imagem);
    albumGrid.appendChild(link);
  });
}

carregarFotos();

const albumPhoto = document.querySelector("#album-photo");
const albumFeedback = document.querySelector("#album-feedback");

if (albumPhoto && albumFeedback) {
  albumPhoto.addEventListener("change", async function () {
    const arquivo = albumPhoto.files[0];

    if (!arquivo) {
      return;
    }

    albumFeedback.textContent = "Enviando foto...";
    albumPhoto.disabled = true;

    try {
      const dados = new FormData();
      dados.append("foto", arquivo);

      const resposta = await fetch(`/api/boxes/${boxId}/fotos`, {
        method: "POST",
        body: dados,
      });

      const respostaDados = await resposta.json();

      if (!resposta.ok) {
        albumFeedback.textContent =
          respostaDados.erro || "Não foi possível publicar a foto.";
        return;
      }

      albumPhoto.value = "";
      await carregarFotos();

      albumFeedback.textContent = "Foto publicada.";
    } catch (erro) {
      console.error(erro);

      albumFeedback.textContent =
        "Não foi possível publicar a foto. Tente novamente.";
    } finally {
      albumPhoto.disabled = false;
    }
  });
}

async function carregarDepoimentos() {
  const testimonialsList = document.querySelector("#testimonials-list");

  if (!testimonialsList) {
    return;
  }

  testimonialsList.innerHTML = "";

  const resposta = await fetch(`/api/boxes/${boxId}/depoimentos`);
  const depoimentos = await resposta.json();

  depoimentos.forEach(function (depoimento) {
    const article = document.createElement("article");
    article.classList.add("testimonial");

    const author = document.createElement("div");
    author.classList.add("testimonial-author");

    const authorInfo = document.createElement("div");

    const nome = document.createElement("h3");
    nome.textContent = depoimento.nome;

    const papel = document.createElement("span");
    papel.textContent = depoimento.papel;

    authorInfo.appendChild(nome);
    authorInfo.appendChild(papel);
    author.appendChild(authorInfo);

    const message = document.createElement("div");
    message.classList.add("testimonial-message");

    const texto = document.createElement("p");
    texto.textContent = depoimento.mensagem;

    message.appendChild(texto);

    article.appendChild(author);
    article.appendChild(message);

    testimonialsList.appendChild(article);
  });
}

carregarDepoimentos();

const testimonialSubmit = document.querySelector("#testimonial-submit");
const testimonialText = document.querySelector("#testimonial-text");
const testimonialFeedback = document.querySelector("#testimonial-feedback");

if (testimonialSubmit && testimonialText && testimonialFeedback) {
  testimonialSubmit.addEventListener("click", async function () {
    const mensagem = testimonialText.value.trim();

    if (!mensagem) {
      testimonialFeedback.textContent =
        "Escreva um depoimento antes de publicar.";
      return;
    }

    testimonialFeedback.textContent = "Publicando...";

    try {
      const resposta = await fetch(`/api/boxes/${boxId}/depoimentos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mensagem: mensagem,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        testimonialFeedback.textContent =
          dados.erro || "Não foi possível publicar o depoimento.";
        return;
      }

      testimonialText.value = "";
      await carregarDepoimentos();

      testimonialFeedback.textContent = "Depoimento publicado.";
    } catch (erro) {
      console.error(erro);

      testimonialFeedback.textContent =
        "Não foi possível publicar o depoimento. Tente novamente.";
    }
  });
}

async function carregarMemorias() {
  const memoriesList = document.querySelector(".memories-list");

  if (!memoriesList) {
    return;
  }

  memoriesList.innerHTML = "";

  const resposta = await fetch(`/api/boxes/${boxId}/memorias`);
  const memorias = await resposta.json();

  memorias.forEach(function (memoria) {
    const article = document.createElement("article");
    article.classList.add("memory");

    const author = document.createElement("div");
    author.classList.add("memory-author");

    const authorInfo = document.createElement("div");

    const nome = document.createElement("h3");
    nome.textContent = memoria.nome;

    const papel = document.createElement("span");
    papel.textContent = memoria.papel;

    authorInfo.appendChild(nome);
    authorInfo.appendChild(papel);
    author.appendChild(authorInfo);

    const content = document.createElement("div");
    content.classList.add("memory-content");

    const titulo = document.createElement("h2");
    titulo.textContent = memoria.titulo;

    content.appendChild(titulo);

    if (memoria.foto) {
      const link = document.createElement("a");
      link.href = `/api/memorias/${memoria.id}/foto`;
      link.target = "_blank";

      const imagem = document.createElement("img");
      imagem.src = `/api/memorias/${memoria.id}/foto`;
      imagem.alt = `Foto da memória compartilhada por ${memoria.nome}`;
      imagem.classList.add("memory-photo");

      link.appendChild(imagem);
      content.appendChild(link);
    }

    const texto = document.createElement("p");
    texto.textContent = memoria.texto;

    content.appendChild(texto);

    article.appendChild(author);
    article.appendChild(content);

    memoriesList.appendChild(article);
  });
}

carregarMemorias();

const memorySubmit = document.querySelector("#memory-submit");
const memoryText = document.querySelector("#memory-text");
const memoryFeedback = document.querySelector("#memory-feedback");
const memoryFileInput = document.querySelector("#memory-file");
const memoryFileFeedback = document.querySelector("#memory-file-feedback");

if (memoryFileInput && memoryFileFeedback) {
  memoryFileInput.addEventListener("change", function () {
    if (memoryFileInput.files.length > 0) {
      memoryFileFeedback.textContent = "Foto carregada.";
    } else {
      memoryFileFeedback.textContent = "";
    }
  });
}

if (memorySubmit && memoryTitle && memoryText && memoryFeedback) {
  memorySubmit.addEventListener("click", async function () {
    const texto = memoryText.value.trim();

    let titulo = memoryTitle.options[memoryTitle.selectedIndex].text;

    if (memoryTitle.value === "outro") {
      const customTitle = document.querySelector("#memory-custom-title");
      titulo = customTitle.value.trim();
    }

    if (!memoryTitle.value || !titulo || !texto) {
      memoryFeedback.textContent =
        "Preencha os campos obrigatórios antes de publicar.";
      return;
    }

    memoryFeedback.textContent = "Publicando...";

    try {
      const memoryFile = document.querySelector("#memory-file");
      const arquivo = memoryFile.files[0];

      const dados = new FormData();

      dados.append("titulo", titulo);
      dados.append("texto", texto);

      if (arquivo) {
        dados.append("foto", arquivo);
      }

      const resposta = await fetch(`/api/boxes/${boxId}/memorias`, {
        method: "POST",
        body: dados,
      });

      const respostaDados = await resposta.json();

      if (!resposta.ok) {
        memoryFeedback.textContent =
          respostaDados.erro || "Não foi possível publicar a memória.";
        return;
      }

      memoryTitle.value = "";
      memoryText.value = "";

      const customTitle = document.querySelector("#memory-custom-title");
      customTitle.value = "";
      customTitle.style.display = "none";

      await carregarMemorias();

      memoryFeedback.textContent = "Memória publicada.";
    } catch (erro) {
      console.error(erro);

      memoryFeedback.textContent =
        "Não foi possível publicar a memória. Tente novamente.";
    }
  });
}

async function carregarPessoas() {
  const peopleList = document.querySelector(".people-list");

  if (!peopleList) {
    return;
  }

  peopleList.innerHTML = "";

  const resposta = await fetch(`/api/boxes/${boxId}/usuarios`);
  const pessoas = await resposta.json();

  const peopleProtagonist = document.querySelector("#people-protagonist");

  const protagonista = pessoas.find(
    (pessoa) => pessoa.papel === "protagonista",
  );

  if (peopleProtagonist && protagonista) {
    peopleProtagonist.innerHTML = "";

    if (protagonista.foto_perfil) {
      const imagem = document.createElement("img");
      imagem.src = protagonista.foto_perfil;
      imagem.alt = `Foto de ${protagonista.nome}`;

      peopleProtagonist.appendChild(imagem);
    }

    const info = document.createElement("div");
    info.classList.add("people-protagonist-info");

    const nome = document.createElement("h2");
    nome.textContent = protagonista.nome;

    const papel = document.createElement("span");
    const partesNome = protagonista.nome.trim().split(/\s+/);

    nome.textContent =
      partesNome.length > 1
        ? `${partesNome[0]} ${partesNome[partesNome.length - 1]}`
        : partesNome[0];

    info.appendChild(nome);
    info.appendChild(papel);
    peopleProtagonist.appendChild(info);
  }

  pessoas
    .filter((pessoa) => pessoa.papel !== "protagonista")
    .forEach(function (pessoa) {
      const article = document.createElement("article");
      article.classList.add("person");

      if (pessoa.foto_perfil) {
        const imagem = document.createElement("img");
        imagem.src = pessoa.foto_perfil;
        imagem.alt = `Foto de ${pessoa.nome}`;

        article.appendChild(imagem);
      }
      const nome = document.createElement("h3");
      const partesNome = pessoa.nome.trim().split(/\s+/);
      nome.textContent =
        partesNome.length > 1
          ? `${partesNome[0]} ${partesNome[partesNome.length - 1]}`
          : partesNome[0];

      const papel = document.createElement("span");
      papel.textContent = pessoa.papel;

      article.appendChild(nome);
      article.appendChild(papel);

      peopleList.appendChild(article);
    });
}

carregarPessoas();

async function carregarParticipantes() {
  if (!boxId) return;

  const lista = document.querySelector("#box-participants");
  if (!lista) return;

  const resposta = await fetch(`/api/boxes/${boxId}/usuarios`);
  const usuarios = await resposta.json();
  const protagonista = usuarios.find(
    (usuario) => usuario.papel === "protagonista",
  );

  const demais = usuarios
    .filter((usuario) => usuario.papel !== "protagonista")
    .sort(() => Math.random() - 0.5);

  const participantes = protagonista
    ? [protagonista, ...demais.slice(0, 5)]
    : demais.slice(0, 6);

  lista.innerHTML = "";

  participantes.forEach((usuario) => {
    const participante = document.createElement("div");
    participante.className = "participant";

    let foto = null;

    if (usuario.foto_perfil) {
      foto = document.createElement("img");
      foto.src = usuario.foto_perfil;
      foto.alt = `Foto de ${usuario.nome}`;
    }

    const info = document.createElement("div");
    info.className = "participant-info";

    const nome = document.createElement("h3");
    nome.textContent = usuario.nome.split(" ")[0];

    const papel = document.createElement("span");
    papel.textContent = usuario.papel;

    info.appendChild(nome);
    info.appendChild(papel);

    if (foto) participante.appendChild(foto);

    participante.appendChild(info);
    lista.appendChild(participante);
  });
}

carregarParticipantes();

async function carregarPerfil() {
  const perfilNome = document.querySelector("#perfil-nome");
  const perfilEmail = document.querySelector("#perfil-email");
  const perfilFoto = document.querySelector("#perfil-foto");

  if (!perfilNome || !perfilEmail) return;

  const resposta = await fetch("/api/auth/me");
  const dados = await resposta.json();

  perfilNome.textContent = dados.usuario.nome;
  perfilEmail.textContent = dados.usuario.email;

  if (perfilFoto && dados.usuario.foto_perfil) {
    perfilFoto.src = dados.usuario.foto_perfil;
  }

  const listaBoxes = document.querySelector("#minhas-boxes");

  if (listaBoxes) {
    const respostaBoxes = await fetch("/api/minhas-boxes");
    const boxes = await respostaBoxes.json();

    listaBoxes.innerHTML = "";

    boxes.forEach((box) => {
      const card = document.createElement("a");
      card.className = "user-box-card";
      card.href = `/boxes/${box.id}`;

      const info = document.createElement("div");
      info.className = "user-box-info";

      const nome = document.createElement("h3");
      nome.textContent = box.nome;

      const evento = document.createElement("p");
      evento.textContent = box.evento;

      const papel = document.createElement("span");
      papel.textContent = box.papel;

      const imagem = document.createElement("img");
      imagem.src = box.imagem_principal;
      imagem.alt = `${box.nome} - ${box.evento}`;

      info.appendChild(nome);
      info.appendChild(evento);
      info.appendChild(papel);

      card.appendChild(imagem);
      card.appendChild(info);
      listaBoxes.appendChild(card);
    });
  }
}

carregarPerfil();
const botaoLogout = document.getElementById("btn-logout");

if (botaoLogout) {
  botaoLogout.addEventListener("click", async function () {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    window.location.href = "/login.html";
  });
}
async function carregarContaHeader() {
  const areaConta = document.getElementById("header-account");

  if (!areaConta) {
    return;
  }

  try {
    const resposta = await fetch("/api/auth/me");

    if (!resposta.ok) {
      return;
    }

    const dados = await resposta.json();
    const usuario = dados.usuario;

    areaConta.innerHTML = "";

    const linkPerfil = document.createElement("a");
    linkPerfil.href = "/perfil";

    if (usuario.foto_perfil) {
      const fotoPerfil = document.createElement("img");
      fotoPerfil.src = usuario.foto_perfil;
      fotoPerfil.alt = `Perfil de ${usuario.nome}`;
      fotoPerfil.className = "header-profile-photo";

      linkPerfil.appendChild(fotoPerfil);
    } else {
      linkPerfil.textContent = "Perfil";
    }

    areaConta.appendChild(linkPerfil);
  } catch (erro) {
    console.error("Erro ao verificar sessão:", erro);
  }
}

carregarContaHeader();

const botaoLogin = document.getElementById("btn-login");

if (botaoLogin) {
  botaoLogin.addEventListener("click", function () {
    window.location.href = "/login.html?retorno=/";
  });
}

const boxAudio = document.getElementById("box-musica");
const musicPlayButton = document.getElementById("music-play-button");

if (boxAudio && musicPlayButton) {
  musicPlayButton.addEventListener("click", async () => {
    if (boxAudio.paused) {
      try {
        await boxAudio.play();
        musicPlayButton.textContent = "❚❚";
        musicPlayButton.setAttribute("aria-label", "Pausar música");
      } catch (erro) {
        console.error("Não foi possível reproduzir a música:", erro);
      }
    } else {
      boxAudio.pause();
      musicPlayButton.textContent = "▶";
      musicPlayButton.setAttribute("aria-label", "Reproduzir música");
    }
  });

  boxAudio.addEventListener("ended", () => {
    musicPlayButton.textContent = "▶";
    musicPlayButton.setAttribute("aria-label", "Reproduzir música");
  });
}
