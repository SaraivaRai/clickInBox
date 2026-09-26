function initializeBoxPage() {
  const pageEvents = new AbortController();
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

  // =========================
  // MEMÓRIAS — ABRIR ESCRITA
  // =========================

  const memoryCreateButton = document.querySelector("#memory-create-button");
  const memoryForm = document.querySelector(".memory-form");

  if (memoryCreateButton && memoryForm) {
    memoryCreateButton.addEventListener("click", function () {
      memoryForm.hidden = false;
      memoryCreateButton.hidden = true;

      document.body.classList.add("memory-writing");

      document.documentElement.style.setProperty(
        "--box-internal-hero-reveal",
        "0px",
      );

      memoryForm.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  const partesUrl = window.location.pathname.split("/");
  const boxId = partesUrl[1] === "boxes" ? partesUrl[2] : null;
  const rotularPapel = (papel) =>
    papel === "cerimonialista" ? "Cerimonial" : papel;

  const linkAlbum = document.querySelector("#link-album");
  const linkDepoimentos = document.querySelector("#link-depoimentos");
  const linkProtagonista = document.querySelector("#link-protagonista");
  const linkMemorias = document.querySelector("#link-memorias");
  const boxReturn = document.querySelector("#box-return");

  async function carregarPermissoesBox() {
    if (!boxId) return {};
    try {
      const resposta = await fetch(`/api/boxes/${boxId}/permissoes`, {
        signal: pageEvents.signal,
      });
      if (!resposta.ok) return {};
      return await resposta.json();
    } catch (erro) {
      if (erro.name !== "AbortError")
        console.error("Erro ao verificar permissão de moderação:", erro);
      return {};
    }
  }

  const permissoesBoxPromise = carregarPermissoesBox();
  const permissaoModeracaoPromise = permissoesBoxPromise.then(
    (permissoes) => permissoes.pode_moderar_publicacoes === true,
  );

  function obterDialogoExclusao() {
    let dialogo = document.getElementById("publication-delete-dialog");
    if (dialogo) return dialogo;

    dialogo = document.createElement("dialog");
    dialogo.id = "publication-delete-dialog";
    dialogo.className = "publication-delete-dialog";
    dialogo.innerHTML = `
    <p>Deseja realmente excluir esta publicação?</p>
    <p class="publication-delete-feedback" role="alert"></p>
    <div class="publication-delete-actions">
      <button type="button" class="publication-delete-cancel">Cancelar</button>
      <button type="button" class="publication-delete-confirm">Excluir</button>
    </div>`;
    document.body.appendChild(dialogo);

    dialogo.querySelector(".publication-delete-cancel").addEventListener(
      "click",
      () => {
        dialogo.close();
      },
      { signal: pageEvents.signal },
    );
    dialogo.querySelector(".publication-delete-confirm").addEventListener(
      "click",
      async () => {
        const pendente = dialogo.publicacaoPendente;
        if (!pendente) return;
        const confirmar = dialogo.querySelector(".publication-delete-confirm");
        const feedback = dialogo.querySelector(".publication-delete-feedback");
        confirmar.disabled = true;
        feedback.textContent = "";
        try {
          const resposta = await fetch(
            `/api/boxes/${boxId}/${pendente.tipo}/${pendente.id}`,
            {
              method: "DELETE",
              signal: pageEvents.signal,
            },
          );
          if (resposta.status !== 204) {
            const dados = await resposta.json().catch(() => ({}));
            throw new Error(
              dados.erro || "Não foi possível excluir a publicação",
            );
          }
          pendente.elemento.remove();
          dialogo.publicacaoPendente = null;
          dialogo.close();
        } catch (erro) {
          if (erro.name !== "AbortError") feedback.textContent = erro.message;
        } finally {
          confirmar.disabled = false;
        }
      },
      { signal: pageEvents.signal },
    );
    return dialogo;
  }

  function criarBotaoExclusao(tipo, id, elemento) {
    elemento.classList.add("publication-moderated");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "publication-delete-button";
    botao.setAttribute("aria-label", "Excluir publicação");
    botao.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>`;
    botao.addEventListener(
      "click",
      (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        const dialogo = obterDialogoExclusao();
        dialogo.publicacaoPendente = { tipo, id, elemento };
        dialogo.querySelector(".publication-delete-feedback").textContent = "";
        dialogo.showModal();
      },
      { signal: pageEvents.signal },
    );
    elemento.appendChild(botao);
  }

  if (boxId) {
    if (linkAlbum) linkAlbum.href = `/boxes/${boxId}/album`;
    if (linkDepoimentos) linkDepoimentos.href = `/boxes/${boxId}/depoimentos`;
    if (linkProtagonista)
      linkProtagonista.href = `/boxes/${boxId}/protagonista`;
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
    const boxApresentacaoImagem = document.querySelector(
      "#box-apresentacao-imagem",
    );
    const boxMusica = document.querySelector("#box-musica");
    const boxMusicaSource = document.querySelector("#box-musica-source");

    if (boxNome) {
      const nomes = box.nome.trim().split(/\s+/).slice(0, 2);

      boxNome.replaceChildren();

      nomes.forEach((nome, index) => {
        const linha = document.createElement("span");

        linha.className = index === 0 ? "nome-linha-1" : "nome-linha-2";

        linha.textContent = nome;

        boxNome.appendChild(linha);
      });
    }
    if (boxEvento) boxEvento.textContent = box.evento;

    const primeiroNome = box.nome.trim().split(/\s+/)[0];
    const testimonialText = document.querySelector("#testimonial-text");
    const memoryText = document.querySelector("#memory-text");
    if (testimonialText)
      testimonialText.placeholder = `Escreva uma mensagem para ${primeiroNome}...`;
    if (memoryText)
      memoryText.placeholder = `Conte uma lembrança com ${primeiroNome}...`;

    if (
      boxApresentacaoImagem &&
      box.apresentacao_tipo === "imagem" &&
      box.apresentacao_imagem
    ) {
      boxApresentacaoImagem.src = box.apresentacao_imagem;
      boxApresentacaoImagem.alt = `${box.nome} — ${box.evento}`;
      boxApresentacaoImagem.hidden = false;
      if (boxNome) boxNome.hidden = true;
      boxEvento?.closest(".box-event-line")?.setAttribute("hidden", "");
    }

    if (box.cor_ambientacao) aplicarAmbientacao(box.cor_ambientacao);

    if (boxImagemPrincipal) {
      boxImagemPrincipal.src = box.imagem_principal;
      boxImagemPrincipal.alt = `${box.nome} - ${box.evento}`;
      if (
        box.imagem_foco_x !== null &&
        box.imagem_foco_y !== null &&
        box.imagem_zoom !== null
      ) {
        const fotoContainer = boxImagemPrincipal.closest(".box-hero-photo");
        const deslocamentoX = -Number(box.imagem_foco_x) * 0.13;

        fotoContainer?.classList.add("has-custom-framing");
        boxImagemPrincipal.classList.add("box-hero-image-custom");
        boxImagemPrincipal.style.setProperty(
          "--box-image-left",
          `${deslocamentoX}%`,
        );
        boxImagemPrincipal.style.setProperty(
          "--box-image-focus-y",
          `${box.imagem_foco_y}%`,
        );
        boxImagemPrincipal.style.setProperty(
          "--box-image-zoom",
          box.imagem_zoom,
        );
      }
    }
    if (boxMusica && boxMusicaSource) {
      if (boxMusicaSource.getAttribute("src") !== box.musica) {
        boxMusicaSource.src = box.musica;
        boxMusica.load();
      }
    }
  }

  function aplicarAmbientacao(cor) {
    const hex = cor.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return;
    const limitar = (valor, minimo, maximo) =>
      Math.min(maximo, Math.max(minimo, valor));
    const linearizar = (valor) =>
      valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
    const codificar = (valor) =>
      valor <= 0.0031308 ? 12.92 * valor : 1.055 * valor ** (1 / 2.4) - 0.055;
    const rgbOriginal = [0, 2, 4].map((i) =>
      linearizar(parseInt(hex.slice(i, i + 2), 16) / 255),
    );
    const l = Math.cbrt(
      0.4122214708 * rgbOriginal[0] +
        0.5363325363 * rgbOriginal[1] +
        0.0514459929 * rgbOriginal[2],
    );
    const m = Math.cbrt(
      0.2119034982 * rgbOriginal[0] +
        0.6806995451 * rgbOriginal[1] +
        0.1073969566 * rgbOriginal[2],
    );
    const s = Math.cbrt(
      0.0883024619 * rgbOriginal[0] +
        0.2817188376 * rgbOriginal[1] +
        0.6299787005 * rgbOriginal[2],
    );
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const cromaticidade = limitar(Math.hypot(a, b), 0.035, 0.22);
    const matiz = Math.atan2(b, a);
    const papel = (luminosidade, fatorCroma, alpha = 1, limiteCroma = 0.16) => {
      const croma = limitar(cromaticidade * fatorCroma, 0.004, limiteCroma);
      const aa = croma * Math.cos(matiz);
      const bb = croma * Math.sin(matiz);
      const ll = luminosidade + 0.3963377774 * aa + 0.2158037573 * bb;
      const mm = luminosidade - 0.1055613458 * aa - 0.0638541728 * bb;
      const ss = luminosidade - 0.0894841775 * aa - 1.291485548 * bb;
      const linear = [
        4.0767416621 * ll ** 3 -
          3.3077115913 * mm ** 3 +
          0.2309699292 * ss ** 3,
        -1.2684380046 * ll ** 3 +
          2.6097574011 * mm ** 3 -
          0.3413193965 * ss ** 3,
        -0.0041960863 * ll ** 3 -
          0.7034186147 * mm ** 3 +
          1.707614701 * ss ** 3,
      ];
      const rgb = linear.map((canal) =>
        Math.round(limitar(codificar(canal), 0, 1) * 255),
      );
      return alpha === 1
        ? `rgb(${rgb.join(", ")})`
        : `rgba(${rgb.join(", ")}, ${alpha})`;
    };
    const root = document.documentElement.style;
    root.setProperty("--box-ambiente-pagina", papel(0.95, 0.18, 1, 0.035));
    root.setProperty("--box-ambiente-header", papel(0.975, 0.1, 1, 0.022));
    root.setProperty("--box-ambiente-hero", papel(0.97, 0.14, 1, 0.028));
    root.setProperty("--box-ambiente-nav", papel(0.98, 0.11, 0.98, 0.024));
    root.setProperty("--box-ambiente-player-1", papel(0.99, 0.06, 0.82, 0.014));
    root.setProperty(
      "--box-ambiente-player-2",
      papel(0.965, 0.13, 0.72, 0.028),
    );
    root.setProperty("--box-ambiente-player-3", papel(0.94, 0.19, 0.6, 0.04));
    root.setProperty("--box-ambiente-card-1", papel(0.985, 0.08, 0.96, 0.018));
    root.setProperty("--box-ambiente-card-2", papel(0.955, 0.17, 0.84, 0.036));
    root.setProperty("--box-ambiente-superficie", papel(0.98, 0.1, 0.9, 0.022));
    root.setProperty("--box-ambiente-borda", papel(0.76, 0.3, 0.38, 0.06));
    root.setProperty("--box-ambiente-mancha", papel(0.86, 0.42, 0.13, 0.08));
    root.setProperty("--box-ambiente-mancha-2", papel(0.91, 0.3, 0.11, 0.055));
    root.setProperty("--box-ambiente-mancha-3", papel(0.81, 0.38, 0.1, 0.075));
    root.setProperty("--box-ambiente-sombra", papel(0.3, 0.1, 0.1, 0.018));
    root.setProperty("--box-decor-deep", papel(0.44, 0.58, 1, 0.11));
    root.setProperty(
      "--box-decor-accent",
      papel(
        limitar(0.6 + (0.7 - cromaticidade) * 0.04, 0.6, 0.68),
        0.88,
        1,
        0.16,
      ),
    );
    root.setProperty("--box-decor-soft", papel(0.76, 0.58, 1, 0.105));
    root.setProperty("--box-decor-glow", papel(0.91, 0.32, 0.28, 0.06));
    root.setProperty("--box-cor-laranja", papel(0.55, 0.76, 1, 0.14));
    root.setProperty("--box-cor-laranja-suave", papel(0.63, 0.7, 1, 0.13));
    root.setProperty("--box-cor-rosa", papel(0.67, 0.78, 1, 0.145));
    root.setProperty("--box-cor-rosa-suave", papel(0.6, 0.72, 1, 0.135));
    root.setProperty("--box-cor-texto-suave", papel(0.43, 0.16, 1, 0.032));
    root.setProperty("--box-texto-secundario", papel(0.4, 0.2, 1, 0.04));
    root.setProperty("--box-nav-texto", papel(0.48, 0.15, 1, 0.03));
    root.setProperty(
      "--box-borda",
      `1px solid ${papel(0.76, 0.3, 0.38, 0.06)}`,
    );
    root.setProperty(
      "--box-borda-suave",
      `1px solid ${papel(0.8, 0.27, 0.42, 0.055)}`,
    );
  }

  carregarBox();

  async function carregarFotos() {
    const albumGrid = document.querySelector(".album-grid");

    if (!albumGrid) {
      return;
    }

    albumGrid.innerHTML = "";
    const podeModerar = await permissaoModeracaoPromise;

    const resposta = await fetch(`/api/boxes/${boxId}/fotos`);
    const fotos = await resposta.json();

    fotos.forEach(function (foto) {
      const publicacao = document.createElement("div");
      publicacao.className = "album-publication";
      const link = document.createElement("a");
      link.href = `/api/fotos/${foto.id}/arquivo`;
      link.target = "_blank";

      const imagem = document.createElement("img");
      imagem.src = `/api/fotos/${foto.id}/arquivo`;
      imagem.alt = `Foto compartilhada por ${foto.nome}`;

      link.appendChild(imagem);
      publicacao.appendChild(link);
      if (podeModerar) criarBotaoExclusao("fotos", foto.id, publicacao);
      albumGrid.appendChild(publicacao);
    });
  }

  carregarFotos();

  const albumPhoto = document.querySelector("#album-photo");
  const albumFeedback = document.querySelector("#album-feedback");
  const albumUploadLabel = document.querySelector(".album-upload label");
  const albumUploadText = document.querySelector(".album-upload label span");

  if (albumPhoto && albumFeedback && albumUploadLabel && albumUploadText) {
    albumPhoto.addEventListener("change", async function () {
      const arquivo = albumPhoto.files[0];

      if (!arquivo) {
        return;
      }

      albumPhoto.disabled = true;
      albumUploadLabel.classList.add("is-loading");
      albumUploadText.textContent = "Enviando...";

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

          albumUploadLabel.classList.remove("is-loading");
          albumUploadLabel.classList.add("is-error");
          albumUploadText.textContent = "Erro ao enviar";

          setTimeout(() => {
            albumUploadLabel.classList.remove("is-error");
            albumUploadText.textContent = "Adicionar fotos";
          }, 2000);

          return;
        }

        albumPhoto.value = "";
        await carregarFotos();

        albumFeedback.textContent = "";
        albumUploadLabel.classList.remove("is-loading");
        albumUploadLabel.classList.add("is-success");
        albumUploadText.textContent = "✓ Foto adicionada";

        setTimeout(() => {
          albumUploadLabel.classList.remove("is-success");
          albumUploadText.textContent = "Adicionar fotos";
        }, 2000);
      } catch (erro) {
        console.error(erro);

        albumFeedback.textContent =
          "Não foi possível publicar a foto. Tente novamente.";

        albumUploadLabel.classList.remove("is-loading");
        albumUploadLabel.classList.add("is-error");
        albumUploadText.textContent = "Erro ao enviar";

        setTimeout(() => {
          albumUploadLabel.classList.remove("is-error");
          albumUploadText.textContent = "Adicionar fotos";
        }, 2000);
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
    const podeModerar = await permissaoModeracaoPromise;

    const resposta = await fetch(`/api/boxes/${boxId}/depoimentos`);
    const depoimentos = await resposta.json();

    depoimentos.forEach(function (depoimento) {
      const article = document.createElement("article");
      article.classList.add("testimonial");

      const author = document.createElement("div");
      author.classList.add("testimonial-author");

      if (depoimento.foto_perfil) {
        const foto = document.createElement("img");
        foto.src = depoimento.foto_perfil;
        foto.alt = `Foto de ${depoimento.nome}`;
        author.appendChild(foto);
      }

      const authorInfo = document.createElement("div");

      const nome = document.createElement("h3");
      nome.textContent = depoimento.nome;

      const papel = document.createElement("span");
      papel.textContent = rotularPapel(depoimento.papel);

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
      if (podeModerar)
        criarBotaoExclusao("depoimentos", depoimento.id, article);

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

      testimonialFeedback.textContent = "";
      testimonialSubmit.textContent = "Publicando...";
      testimonialSubmit.disabled = true;

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

          testimonialSubmit.textContent = "Enviar depoimento";
          testimonialSubmit.disabled = false;
          return;
        }

        testimonialText.value = "";
        await carregarDepoimentos();

        testimonialSubmit.textContent = "✓ Depoimento publicado";
        testimonialSubmit.disabled = false;
        testimonialFeedback.textContent = "";
      } catch (erro) {
        console.error(erro);

        testimonialFeedback.textContent =
          "Não foi possível publicar o depoimento. Tente novamente.";

        testimonialSubmit.textContent = "Enviar depoimento";
        testimonialSubmit.disabled = false;
      }
    });
  }

  const testimonialCreateButton = document.querySelector(
    "#testimonial-create-button",
  );

  if (testimonialSubmit && testimonialText) {
    testimonialText.addEventListener("input", function () {
      if (testimonialSubmit.textContent === "✓ Depoimento publicado") {
        testimonialSubmit.textContent = "Enviar depoimento";
      }
    });
  }

  const testimonialForm = document.querySelector(".testimonial-form");

  if (testimonialCreateButton && testimonialForm) {
    testimonialCreateButton.addEventListener("click", function () {
      testimonialForm.hidden = false;
      testimonialCreateButton.hidden = true;

      document.body.classList.add("testimonial-writing");

      document.documentElement.style.setProperty(
        "--box-internal-hero-reveal",
        "0px",
      );

      testimonialForm.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  async function carregarMemorias() {
    const memoriesList = document.querySelector(".memories-list");

    if (!memoriesList) {
      return;
    }

    memoriesList.innerHTML = "";
    const podeModerar = await permissaoModeracaoPromise;

    const resposta = await fetch(`/api/boxes/${boxId}/memorias`);
    const memorias = await resposta.json();

    memorias.forEach(function (memoria) {
      const article = document.createElement("article");
      article.classList.add("memory");

      /*
       * FOTO
       * Só existe quando a memória possui uma imagem.
       */
      if (memoria.foto) {
        const photoWrap = document.createElement("div");
        photoWrap.classList.add("memory-photo-wrap");

        const link = document.createElement("a");
        link.href = `/api/memorias/${memoria.id}/foto`;
        link.target = "_blank";

        const imagem = document.createElement("img");
        imagem.src = `/api/memorias/${memoria.id}/foto`;
        imagem.alt = `Foto da memória compartilhada por ${memoria.nome}`;
        imagem.classList.add("memory-photo");

        link.appendChild(imagem);
        photoWrap.appendChild(link);
        article.appendChild(photoWrap);
      } else {
        article.classList.add("memory-without-photo");
      }

      /*
       * CONTEÚDO EDITORIAL
       */
      const body = document.createElement("div");
      body.classList.add("memory-body");

      const author = document.createElement("div");
      author.classList.add("memory-author");

      const nome = document.createElement("h3");
      nome.textContent = memoria.nome;

      const papel = document.createElement("span");
      papel.textContent = rotularPapel(memoria.papel);

      author.appendChild(nome);
      author.appendChild(papel);

      const titulo = document.createElement("h2");
      titulo.classList.add("memory-title");
      titulo.textContent = memoria.titulo;

      const texto = document.createElement("p");
      texto.classList.add("memory-text");
      texto.textContent = memoria.texto;

      body.appendChild(author);
      body.appendChild(titulo);
      body.appendChild(texto);

      article.appendChild(body);
      if (podeModerar) criarBotaoExclusao("memorias", memoria.id, article);
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
    const memoryFileLabel = document.querySelector('label[for="memory-file"]');

    if (memoryFileLabel) {
      memoryFileLabel.textContent = "▧  Adicionar foto";
    }

    memoryFileInput.addEventListener("change", function () {
      if (!memoryFileLabel) {
        return;
      }

      if (memoryFileInput.files.length > 0) {
        memoryFileLabel.textContent = "✓  Foto adicionada";
        memoryFileLabel.classList.add("has-photo");
      } else {
        memoryFileLabel.textContent = "▧  Adicionar foto";
        memoryFileLabel.classList.remove("has-photo");
      }

      memoryFileFeedback.textContent = "";
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

      memoryFeedback.textContent = "";
      memorySubmit.textContent = "Publicando...";
      memorySubmit.disabled = true;

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
          memorySubmit.textContent = "Compartilhar memória";
          memorySubmit.disabled = false;
          return;
        }

        memoryTitle.value = "";
        memoryText.value = "";

        const customTitle = document.querySelector("#memory-custom-title");
        customTitle.value = "";
        customTitle.style.display = "none";

        memoryFileInput.value = "";

        const memoryFileLabel = document.querySelector(
          'label[for="memory-file"]',
        );

        if (memoryFileLabel) {
          memoryFileLabel.textContent = "▧  Adicionar foto";
          memoryFileLabel.classList.remove("has-photo");
        }

        memoryFileFeedback.textContent = "";

        await carregarMemorias();

        memoryFeedback.textContent = "";
        memorySubmit.textContent = "✓ Memória publicada";
        memorySubmit.disabled = false;

        function prepararNovaMemoria() {
          if (
            memorySubmit &&
            memorySubmit.textContent === "✓ Memória publicada"
          ) {
            memorySubmit.textContent = "Compartilhar memória";
          }
        }

        if (memoryTitle) {
          memoryTitle.addEventListener("change", prepararNovaMemoria);
        }

        if (memoryText) {
          memoryText.addEventListener("input", prepararNovaMemoria);
        }

        if (memoryFileInput) {
          memoryFileInput.addEventListener("change", prepararNovaMemoria);
        }
      } catch (erro) {
        console.error(erro);

        memorySubmit.textContent = "Compartilhar memória";
        memorySubmit.disabled = false;

        memoryFeedback.textContent =
          "Não foi possível publicar a memória. Tente novamente.";
      }
    });
  }

  async function carregarPessoas() {
    const protagonistGrid = document.querySelector("#protagonist-grid");

    if (protagonistGrid) {
      const loading = document.querySelector("#protagonist-loading");
      const empty = document.querySelector("#protagonist-empty");
      const createButton = document.querySelector("#protagonist-create-button");
      const form = document.querySelector("#protagonist-form");
      const createDialog = document.querySelector("#protagonist-create-dialog");
      const createCloseButton = document.querySelector(
        "#protagonist-create-close",
      );
      const cancelButton = document.querySelector("#protagonist-form-cancel");
      const submitButton = document.querySelector("#protagonist-submit");
      const feedback = document.querySelector("#protagonist-feedback");
      const photoInput = document.querySelector("#protagonist-photo");
      const photoLabel = document.querySelector("#protagonist-photo-label");
      const fileFeedback = document.querySelector("#protagonist-file-feedback");
      const overlay = document.querySelector("#protagonist-overlay");
      const overlayImage = overlay.querySelector(".protagonist-overlay-image");
      const overlayTitle = overlay.querySelector("#protagonist-overlay-title");
      const overlayCaption = overlay.querySelector(
        ".protagonist-overlay-caption",
      );
      const overlayAuthor = overlay.querySelector(
        ".protagonist-overlay-author",
      );
      let overlayOpener = null;
      let createOpener = null;
      let creationScrollY = 0;

      function fecharOverlay() {
        overlay.close();
        document.body.classList.remove("protagonist-overlay-open");
        overlayOpener?.focus();
      }

      function abrirOverlay(publicacao, opener) {
        overlayOpener = opener;
        overlayImage.src = `/api/boxes/${boxId}/protagonista/${publicacao.id}/foto`;
        overlayImage.alt = publicacao.titulo;
        overlayTitle.textContent = publicacao.titulo;
        overlayCaption.textContent = publicacao.legenda || "";
        overlayCaption.hidden = !publicacao.legenda;
        overlayAuthor.textContent = `Publicado por ${publicacao.autor_nome}`;
        document.body.classList.add("protagonist-overlay-open");
        overlay.showModal();
      }

      overlay
        .querySelector(".protagonist-overlay-close")
        .addEventListener("click", fecharOverlay, {
          signal: pageEvents.signal,
        });
      overlay.addEventListener(
        "click",
        (event) => {
          if (event.target === overlay) fecharOverlay();
        },
        { signal: pageEvents.signal },
      );
      overlay.addEventListener(
        "close",
        () => document.body.classList.remove("protagonist-overlay-open"),
        { signal: pageEvents.signal },
      );

      async function carregarPublicacoesProtagonista() {
        loading.hidden = false;
        empty.hidden = true;
        protagonistGrid.innerHTML = "";
        try {
          const [resposta, podeModerar] = await Promise.all([
            fetch(`/api/boxes/${boxId}/protagonista`, {
              signal: pageEvents.signal,
            }),
            permissaoModeracaoPromise,
          ]);
          if (!resposta.ok)
            throw new Error("Não foi possível carregar as publicações.");
          const publicacoes = await resposta.json();
          for (const publicacao of publicacoes) {
            const article = document.createElement("article");
            article.className = "protagonist-publication";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "protagonist-publication-open";
            openButton.setAttribute("aria-label", `Abrir ${publicacao.titulo}`);
            const image = document.createElement("img");
            image.src = `/api/boxes/${boxId}/protagonista/${publicacao.id}/foto`;
            image.alt = publicacao.titulo;
            image.loading = "lazy";
            const title = document.createElement("span");
            title.className = "protagonist-publication-title";
            title.textContent = publicacao.titulo;
            openButton.append(image, title);
            openButton.addEventListener(
              "click",
              () => abrirOverlay(publicacao, openButton),
              { signal: pageEvents.signal },
            );
            article.appendChild(openButton);
            if (podeModerar) {
              criarBotaoExclusao("protagonista", publicacao.id, article);
            }
            protagonistGrid.appendChild(article);
          }
          empty.hidden = publicacoes.length !== 0;
        } catch (erro) {
          if (erro.name !== "AbortError") {
            empty.textContent = erro.message;
            empty.hidden = false;
          }
        } finally {
          loading.hidden = true;
        }
      }

      permissoesBoxPromise.then((permissoes) => {
        if (permissoes.pode_publicar_protagonista === true) {
          createButton.hidden = false;
        }
      });

      function restaurarCriacao() {
        form.reset();
        feedback.textContent = "";
        fileFeedback.textContent = "";
        photoLabel.textContent = "Escolher foto";
        photoLabel.classList.remove("has-photo");
        createButton.hidden = false;
        document.body.classList.remove("protagonist-create-open");
        document.body.style.top = "";
        window.scrollTo(0, creationScrollY);
        createOpener?.focus();
      }

      function fecharCriacao() {
        if (createDialog.open) createDialog.close();
      }

      photoInput.addEventListener(
        "change",
        () => {
          const arquivo = photoInput.files[0];
          photoLabel.textContent = arquivo
            ? "✓ Foto escolhida"
            : "Escolher foto";
          photoLabel.classList.toggle("has-photo", Boolean(arquivo));
          fileFeedback.textContent = arquivo ? arquivo.name : "";
        },
        { signal: pageEvents.signal },
      );
      photoLabel.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            photoInput.click();
          }
        },
        { signal: pageEvents.signal },
      );

      createButton.addEventListener(
        "click",
        () => {
          createOpener = createButton;
          creationScrollY = window.scrollY;
          createButton.hidden = true;
          document.body.style.top = `-${creationScrollY}px`;
          document.body.classList.add("protagonist-create-open");
          createDialog.showModal();
          photoLabel.focus();
        },
        { signal: pageEvents.signal },
      );
      createCloseButton.addEventListener("click", fecharCriacao, {
        signal: pageEvents.signal,
      });
      createDialog.addEventListener(
        "click",
        (event) => {
          if (event.target === createDialog) fecharCriacao();
        },
        { signal: pageEvents.signal },
      );
      createDialog.addEventListener(
        "cancel",
        (event) => {
          if (submitButton.disabled) event.preventDefault();
        },
        { signal: pageEvents.signal },
      );
      createDialog.addEventListener("close", restaurarCriacao, {
        signal: pageEvents.signal,
      });
      cancelButton.addEventListener(
        "click",
        () => {
          fecharCriacao();
        },
        { signal: pageEvents.signal },
      );
      form.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();
          if (submitButton.disabled) return;
          feedback.textContent = "";
          submitButton.disabled = true;
          submitButton.textContent = "Publicando...";
          try {
            const resposta = await fetch(`/api/boxes/${boxId}/protagonista`, {
              method: "POST",
              body: new FormData(form),
              signal: pageEvents.signal,
            });
            if (!resposta.ok) {
              const dados = await resposta.json().catch(() => ({}));
              throw new Error(dados.erro || "Não foi possível publicar.");
            }
            await carregarPublicacoesProtagonista();
            fecharCriacao();
          } catch (erro) {
            if (erro.name !== "AbortError") feedback.textContent = erro.message;
          } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Publicar";
          }
        },
        { signal: pageEvents.signal },
      );

      carregarPublicacoesProtagonista();
    }

    const peopleList = document.querySelector(".people-list");
    if (!peopleList) return;

    const criarAvatar = (pessoa, classe) => {
      if (pessoa.foto_perfil) {
        const imagem = document.createElement("img");
        imagem.className = classe;
        imagem.src = pessoa.foto_perfil;
        imagem.alt = `Foto de ${pessoa.nome}`;
        imagem.loading = "lazy";
        return imagem;
      }

      const fallback = document.createElement("div");
      fallback.className = `${classe} person-avatar-fallback`;
      fallback.setAttribute("role", "img");
      fallback.setAttribute(
        "aria-label",
        `${pessoa.nome} não possui foto de perfil`,
      );
      fallback.textContent = pessoa.nome
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((parte) => parte.charAt(0))
        .join("")
        .toUpperCase();
      return fallback;
    };

    const criarTagPapel = (papel) => {
      const tag = document.createElement("span");
      tag.className = `people-role tag-${papel}`;
      tag.textContent = rotularPapel(papel);
      return tag;
    };

    peopleList.innerHTML = "";
    const resposta = await fetch(`/api/boxes/${boxId}/usuarios`);
    const pessoas = await resposta.json();
    const peopleProtagonist = document.querySelector("#people-protagonist");
    const peopleCeremonialist = document.querySelector("#people-ceremonialist");
    const protagonista = pessoas.find(
      (pessoa) => pessoa.papel === "protagonista",
    );
    const cerimonialista = pessoas.find(
      (pessoa) => pessoa.papel === "cerimonialista",
    );

    if (peopleProtagonist) peopleProtagonist.innerHTML = "";
    if (peopleCeremonialist) {
      peopleCeremonialist.innerHTML = "";
      peopleCeremonialist.hidden = !cerimonialista;
    }

    if (peopleCeremonialist && cerimonialista) {
      const card = document.createElement("article");
      card.className = "people-ceremonialist-card";
      card.appendChild(
        criarAvatar(cerimonialista, "people-ceremonialist-avatar"),
      );
      const info = document.createElement("div");
      info.className = "people-ceremonialist-info";
      const nome = document.createElement("h2");
      const partesNome = cerimonialista.nome.trim().split(/\s+/);
      nome.textContent =
        partesNome.length > 1
          ? `${partesNome[0]} ${partesNome[partesNome.length - 1]}`
          : partesNome[0];
      nome.title = cerimonialista.nome.trim();
      info.appendChild(nome);
      info.appendChild(criarTagPapel(cerimonialista.papel));
      card.appendChild(info);
      peopleCeremonialist.appendChild(card);
    }

    if (peopleProtagonist && protagonista) {
      peopleProtagonist.appendChild(
        criarAvatar(protagonista, "people-protagonist-avatar"),
      );
      const info = document.createElement("div");
      info.classList.add("people-protagonist-info");
      const nome = document.createElement("h2");
      nome.textContent = protagonista.nome.trim();
      nome.title = protagonista.nome.trim();
      info.appendChild(nome);
      info.appendChild(criarTagPapel(protagonista.papel));
      peopleProtagonist.appendChild(info);
    }

    pessoas
      .filter(
        (pessoa) =>
          pessoa.papel !== "protagonista" && pessoa.papel !== "cerimonialista",
      )
      .forEach((pessoa) => {
        const article = document.createElement("article");
        article.classList.add("person");
        article.appendChild(criarAvatar(pessoa, "person-avatar"));
        const nome = document.createElement("h3");
        nome.textContent = pessoa.nome.trim();
        nome.title = pessoa.nome.trim();
        article.appendChild(nome);
        article.appendChild(criarTagPapel(pessoa.papel));
        peopleList.appendChild(article);
      });
  }

  carregarPessoas();

  async function carregarParticipantes() {
    if (!boxId) return;

    const lista = document.querySelector("#box-participants");
    if (!lista) return;

    const resposta = await fetch(`/api/boxes/${boxId}/participantes`);
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

      let foto;

      if (usuario.foto_perfil) {
        foto = document.createElement("img");
        foto.src = usuario.foto_perfil;
        foto.alt = `Foto de ${usuario.nome}`;
      } else {
        foto = document.createElement("div");
        foto.className = "participant-avatar-fallback";
        foto.textContent = usuario.nome
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((parte) => parte[0])
          .join("")
          .toUpperCase();
        foto.setAttribute("role", "img");
        foto.setAttribute(
          "aria-label",
          `${usuario.nome} não possui foto de perfil`,
        );
      }

      const info = document.createElement("div");
      info.className = "participant-info";

      const nome = document.createElement("h3");
      nome.textContent = usuario.nome.split(" ")[0];

      const papel = document.createElement("span");
      papel.textContent = rotularPapel(usuario.papel);
      papel.className = `tag tag-${usuario.papel.toLowerCase()}`;

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
        papel.textContent = rotularPapel(box.papel);

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

  const peopleSpecialLink = document.querySelector("#people-special-link");

  if (peopleSpecialLink) {
    const abrirPessoas = () => {
      window.location.href = `/boxes/${boxId}/pessoas`;
    };

    peopleSpecialLink.addEventListener("click", abrirPessoas);

    peopleSpecialLink.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        abrirPessoas();
      }
    });
  }

  carregarPerfil();
  const botaoLogout = document.getElementById("btn-logout");

  if (botaoLogout) {
    botaoLogout.addEventListener("click", async function () {
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      window.location.href = "/";
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

  let loginDestino = null;

  function criarLoginOverlay() {
    let overlay = document.getElementById("login-overlay");

    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = "login-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
    <div class="login-overlay-panel">
      <button
        type="button"
        id="login-overlay-close"
        aria-label="Fechar"
      >
        ×
      </button>

      <img
        src="/assets/logo/logo.png"
        alt="Click In Box"
        class="login-overlay-logo"
      />

      <h2>Entre para continuar</h2>

      <div id="google-login-button"></div>
    </div>
  `;

    document.body.appendChild(overlay);

    const fechar = overlay.querySelector("#login-overlay-close");

    fechar.addEventListener("click", function () {
      overlay.hidden = true;
      loginDestino = null;
    });

    return overlay;
  }

  function carregarGoogleLogin() {
    return new Promise((resolve) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const scriptExistente = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]',
      );

      if (scriptExistente) {
        scriptExistente.addEventListener("load", resolve, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;

      document.head.appendChild(script);
    });
  }

  async function abrirLoginOverlay(destino = null) {
    const overlay = criarLoginOverlay();

    loginDestino = destino;
    overlay.hidden = false;

    await carregarGoogleLogin();

    google.accounts.id.initialize({
      client_id:
        "699415164315-cv5d4hbqoirdbnkeo04kdbmk7vi8vuj0.apps.googleusercontent.com",
      callback: handleGoogleCredential,
    });

    const container = document.getElementById("google-login-button");
    container.innerHTML = "";

    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
    });
  }

  async function handleGoogleCredential(response) {
    const resposta = await fetch("/api/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credential: response.credential,
      }),
    });

    if (!resposta.ok) {
      return;
    }

    if (loginDestino) {
      const destino = loginDestino;
      loginDestino = null;
      document.getElementById("login-overlay")?.setAttribute("hidden", "");
      if (isBoxDestination(destino)) {
        await navigateBox(destino);
      } else {
        window.location.href = destino;
      }
      return;
    }

    const overlay = document.getElementById("login-overlay");

    if (overlay) {
      overlay.hidden = true;
    }

    await carregarContaHeader();
  }

  const botaoLogin = document.getElementById("btn-login");

  if (botaoLogin) {
    botaoLogin.addEventListener("click", function () {
      abrirLoginOverlay();
    });
  }

  const retornoConvite = new URLSearchParams(window.location.search).get(
    "retorno",
  );
  const boxFechada = /^\/boxes\/[^/]+\/?$/.test(window.location.pathname);

  if (
    boxFechada &&
    retornoConvite &&
    /^\/convite\/[A-Za-z0-9_-]+$/.test(retornoConvite)
  ) {
    abrirLoginOverlay(retornoConvite);
  }

  const gavetasPrivadas = [
    linkAlbum,
    linkDepoimentos,
    linkMemorias,
    linkProtagonista,
  ].filter(Boolean);

  gavetasPrivadas.forEach((gaveta) => {
    gaveta.addEventListener("click", async function (event) {
      event.preventDefault();

      const destino = gaveta.href;
      const resposta = await fetch("/api/auth/me");

      if (resposta.ok) {
        await navigateBox(destino);
        return;
      }

      abrirLoginOverlay(destino);
    });
  });

  const boxAudio = document.getElementById("box-musica");
  const musicPlayButton = document.getElementById("music-play-button");

  if (boxAudio && musicPlayButton) {
    musicPlayButton.textContent = boxAudio.paused ? "▶" : "❚❚";
    musicPlayButton.setAttribute(
      "aria-label",
      boxAudio.paused ? "Reproduzir música" : "Pausar música",
    );
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

    boxAudio.onended = () => {
      const button = document.getElementById("music-play-button");
      if (button) {
        button.textContent = "▶";
        button.setAttribute("aria-label", "Reproduzir música");
      }
    };
  }

  // =========================
  // BOX INTERNA — HERO INTELIGENTE
  // =========================

  const boxInternalHero = document.querySelector(".box-internal-hero");
  const boxInternalNav = document.querySelector(".box-internal-nav");

  if (boxInternalHero && boxInternalNav) {
    const ALTURA_HERO = 231;
    const LIMIAR_DIRECAO = 12;

    let ultimaPosicao = window.scrollY;
    let direcaoAtual = null;
    let movimentoDirecao = 0;
    let heroRevelado = 0;

    function atualizarHero() {
      document.documentElement.style.setProperty(
        "--box-internal-hero-reveal",
        `${heroRevelado}px`,
      );
    }

    window.addEventListener(
      "scroll",
      function () {
        const posicaoAtual = window.scrollY;
        const delta = posicaoAtual - ultimaPosicao;

        if (Math.abs(delta) < 1) {
          ultimaPosicao = posicaoAtual;
          return;
        }

        const novaDirecao = delta > 0 ? "baixo" : "cima";

        if (novaDirecao !== direcaoAtual) {
          direcaoAtual = novaDirecao;
          movimentoDirecao = 0;
        }

        movimentoDirecao += Math.abs(delta);

        /*
         * Enquanto ainda estamos na região natural do hero,
         * não interferimos em nada.
         */
        const heroJaPassou = posicaoAtual > ALTURA_HERO;

        if (heroJaPassou && movimentoDirecao >= LIMIAR_DIRECAO) {
          if (direcaoAtual === "cima") {
            heroRevelado = Math.min(
              ALTURA_HERO,
              heroRevelado + Math.abs(delta),
            );
          }

          if (direcaoAtual === "baixo") {
            heroRevelado = Math.max(0, heroRevelado - Math.abs(delta));
          }

          atualizarHero();
        }

        /*
         * Voltamos fisicamente para a região original:
         * o comportamento natural assume novamente.
         */
        if (posicaoAtual <= ALTURA_HERO) {
          heroRevelado = Math.min(heroRevelado, Math.max(0, posicaoAtual));
          movimentoDirecao = 0;
          atualizarHero();
        }

        ultimaPosicao = posicaoAtual;
      },
      { passive: true, signal: pageEvents.signal },
    );
  }

  const boxReturnLink = document.getElementById("box-return");
  const boxReturnTriggers = document.querySelectorAll(".box-return-trigger");

  if (boxReturnTriggers.length) {
    function voltarParaBox() {
      const destino = boxReturnLink?.getAttribute("href") || `/boxes/${boxId}`;

      if (destino && destino !== "#") {
        navigateBox(destino);
      }
    }

    boxReturnTriggers.forEach((trigger) => {
      trigger.addEventListener("click", voltarParaBox);

      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          voltarParaBox();
        }
      });
    });
  }
  return pageEvents;
}

// Keep the media element in this document while navigating within one Box.
const boxRoute = window.location.pathname.match(
  /^\/boxes\/([^/]+)(?:\/(?:album|depoimentos|memorias|pessoas|protagonista))?\/?$/,
);
const persistentBoxId = boxRoute?.[1];
let currentPageEvents;
let navigationNumber = 0;

function isBoxDestination(href) {
  if (!persistentBoxId) return false;
  const url = new URL(href, window.location.href);
  const parts = url.pathname.replace(/\/$/, "").split("/");
  return (
    url.origin === window.location.origin &&
    parts[1] === "boxes" &&
    parts[2] === persistentBoxId &&
    (parts.length === 3 ||
      (parts.length === 4 &&
        [
          "album",
          "depoimentos",
          "memorias",
          "pessoas",
          "protagonista",
        ].includes(parts[3])))
  );
}

async function navigateBox(href, addHistory = true) {
  const url = new URL(href, window.location.href);
  if (!isBoxDestination(url.href)) {
    window.location.href = url.href;
    return;
  }

  const navigation = ++navigationNumber;
  try {
    const response = await fetch(url.href);
    const finalUrl = new URL(response.url);
    if (
      !response.ok ||
      !isBoxDestination(finalUrl.href) ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      window.location.href = url.href;
      return;
    }

    const nextDocument = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    if (navigation !== navigationNumber) return;

    // The original audio remains attached; discard the new page's copy.
    nextDocument.getElementById("box-musica")?.remove();
    nextDocument.body
      .querySelectorAll("script")
      .forEach((script) => script.remove());
    const audioHost = document.getElementById("persistent-box-audio");
    currentPageEvents?.abort();
    for (const child of [...document.body.childNodes]) {
      if (child !== audioHost) child.remove();
    }
    document.body.className = nextDocument.body.className;
    document.body.append(...nextDocument.body.childNodes);
    document.title = nextDocument.title;
    if (addHistory) history.pushState(null, "", finalUrl.href);
    window.scrollTo(0, 0);
    currentPageEvents = initializeBoxPage();
  } catch (error) {
    console.error("Não foi possível abrir a página da Box:", error);
    window.location.href = url.href;
  }
}

if (persistentBoxId) {
  const audio = document.getElementById("box-musica");
  const audioHost = document.createElement("div");
  audioHost.id = "persistent-box-audio";
  audioHost.hidden = true;
  audioHost.append(audio);
  document.body.append(audioHost);

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (
      event.defaultPrevented ||
      !link ||
      link.target ||
      link.hasAttribute("download") ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !isBoxDestination(link.href)
    )
      return;
    event.preventDefault();
    navigateBox(link.href);
  });

  window.addEventListener("popstate", () => {
    if (isBoxDestination(window.location.href)) {
      navigateBox(window.location.href, false);
    } else {
      window.location.reload();
    }
  });
}

currentPageEvents = initializeBoxPage();
