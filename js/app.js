
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

async function carregarFotos() {
  const albumGrid = document.querySelector(".album-grid");

  if (!albumGrid) {
    return;
  }

  albumGrid.innerHTML = "";

  const resposta = await fetch("/api/boxes/1/fotos");
  const fotos = await resposta.json();

  fotos.forEach(function (foto) {
    const imagem = document.createElement("img");

    imagem.src = `/api/fotos/${foto.id}/arquivo`;
    imagem.alt = `Foto compartilhada por ${foto.nome}`;

    albumGrid.appendChild(imagem);
  });
}

carregarFotos();

const albumPhoto = document.querySelector("#album-photo");

if (albumPhoto) {
  albumPhoto.addEventListener("change", async function () {
    const arquivo = albumPhoto.files[0];

    if (!arquivo) {
      return;
    }

    const dados = new FormData();
    dados.append("foto", arquivo);

    const resposta = await fetch("/api/boxes/1/fotos", {
      method: "POST",
      body: dados,
    });

    if (resposta.ok) {
      albumPhoto.value = "";
      await carregarFotos();
    }
  });
}

async function carregarDepoimentos() {
  const testimonialsList = document.querySelector("#testimonials-list");

  if (!testimonialsList) {
    return;
  }

  testimonialsList.innerHTML = "";

  const resposta = await fetch("/api/boxes/1/depoimentos");
  const depoimentos = await resposta.json();

  depoimentos.forEach(function (depoimento) {
    const article = document.createElement("article");
    article.classList.add("testimonial");

    article.innerHTML = `
            <div class="testimonial-author">
                <div>
                    <h3>${depoimento.nome}</h3>
                    <span>${depoimento.papel}</span>
                </div>
            </div>

            <div class="testimonial-message">
                <p>${depoimento.mensagem}</p>
            </div>
        `;

    testimonialsList.appendChild(article);
  });
}

carregarDepoimentos();



const testimonialSubmit = document.querySelector("#testimonial-submit");
const testimonialText = document.querySelector("#testimonial-text");
if (testimonialSubmit && testimonialText) {
  testimonialSubmit.addEventListener("click", async function () {
    const mensagem = testimonialText.value.trim();

    if (!mensagem) {
      return;
    }

    const resposta = await fetch("/api/boxes/1/depoimentos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mensagem: mensagem,
      }),
    });

    if (resposta.ok) {
      testimonialText.value = "";
      await carregarDepoimentos();
    }
  });
}

async function carregarMemorias() {
  const memoriesList = document.querySelector(".memories-list");

  if (!memoriesList) {
    return;
  }

  memoriesList.innerHTML = "";

  const resposta = await fetch("/api/boxes/1/memorias");
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
      const imagem = document.createElement("img");

      imagem.src = `/api/memorias/${memoria.id}/foto`;
      imagem.alt = `Foto da memória compartilhada por ${memoria.nome}`;
      imagem.classList.add("memory-photo");

      content.appendChild(imagem);
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

if (memorySubmit && memoryTitle && memoryText) {
  memorySubmit.addEventListener("click", async function () {
    const texto = memoryText.value.trim();

    let titulo = memoryTitle.options[memoryTitle.selectedIndex].text;

    if (memoryTitle.value === "outro") {
      const customTitle = document.querySelector("#memory-custom-title");
      titulo = customTitle.value.trim();
    }

    if (!memoryTitle.value || !titulo || !texto) {
      return;
    }

    const memoryFile = document.querySelector("#memory-file");
    const arquivo = memoryFile.files[0];

    const dados = new FormData();

    dados.append("titulo", titulo);
    dados.append("texto", texto);

    if (arquivo) {
      dados.append("foto", arquivo);
    }

    const resposta = await fetch("/api/boxes/1/memorias", {
      method: "POST",
      body: dados,
    });

    if (resposta.ok) {
      memoryTitle.value = "";
      memoryText.value = "";

      const customTitle = document.querySelector("#memory-custom-title");
      customTitle.value = "";
      customTitle.style.display = "none";

      await carregarMemorias();
    }
  });
}

async function carregarPessoas() {
  const peopleList = document.querySelector(".people-list");

  if (!peopleList) {
    return;
  }

  peopleList.innerHTML = "";

  const resposta = await fetch("/api/boxes/1/usuarios");
  const pessoas = await resposta.json();

  pessoas.forEach(function (pessoa) {
    const article = document.createElement("article");
    article.classList.add("person");

    const nome = document.createElement("h3");
    nome.textContent = pessoa.nome;

    const papel = document.createElement("span");
    papel.textContent = pessoa.papel;

    article.appendChild(nome);
    article.appendChild(papel);

    peopleList.appendChild(article);
  });
}

carregarPessoas();
