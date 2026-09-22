async function carregarBoxesDaHome() {
  const lista = document.getElementById("home-boxes-list");
  if (!lista) return;

  try {
    const resposta = await fetch("/api/boxes");
    if (!resposta.ok) throw new Error("Não foi possível carregar as Boxes");
    const boxes = await resposta.json();

    lista.replaceChildren(...boxes.map((box) => {
      const artigo = document.createElement("article");
      const link = document.createElement("a");
      const imagem = document.createElement("img");
      const info = document.createElement("div");
      const nome = document.createElement("h3");
      const evento = document.createElement("p");

      link.href = `/boxes/${box.id}`;
      imagem.src = box.imagem_principal;
      imagem.alt = `${box.nome} - ${box.evento}`;
      nome.textContent = box.nome;
      evento.textContent = box.evento;
      info.className = "story-info";
      info.append(nome, evento);
      link.append(imagem, info);
      artigo.append(link);
      return artigo;
    }));
  } catch (erro) {
    console.error("Erro ao carregar Boxes da Home:", erro);
  }
}

carregarBoxesDaHome();
