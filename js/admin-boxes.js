const app = document.getElementById("admin-app");
const editMatch = location.pathname.match(/^\/admin\/boxes\/(\d+)\/editar\/?$/);
const creating = location.pathname.endsWith("/nova");
const inviteLabels = { protagonista: "Protagonista", mae: "Mãe", pai: "Pai", coautora: "As 15", convidado: "Convidados" };

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.erro || "Não foi possível concluir a operação");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
}

async function renderList() {
  app.innerHTML = `<div class="admin-title-row"><h1>Boxes</h1><a class="button" href="/admin/boxes/nova">Criar nova Box</a></div><div id="box-list" class="box-list">Carregando…</div>`;
  try {
    const boxes = await api("/api/admin/boxes");
    document.getElementById("box-list").innerHTML = boxes.length ? boxes.map((box) => `
      <article class="box-card">
        <h2>${escapeHtml(box.nome)}</h2><p>${escapeHtml(box.evento)} · ${box.data_evento ? new Date(box.data_evento).toLocaleDateString("pt-BR", { timeZone:"UTC" }) : "sem data"}</p>
        <div class="card-actions"><a class="button" href="/admin/boxes/${box.id}/editar">Editar</a><a class="secondary" href="/boxes/${box.id}" target="_blank">Abrir Box</a></div>
      </article>`).join("") : "<p>Nenhuma Box cadastrada.</p>";
  } catch (error) { app.innerHTML = `<p class="feedback error">${escapeHtml(error.message)}</p>`; }
}

function formHtml(box = {}) {
  const date = box.data_evento ? String(box.data_evento).slice(0,10) : "";
  const focusX = box.imagem_foco_x ?? 50, focusY = box.imagem_foco_y ?? 50, zoom = box.imagem_zoom ?? 1;
  return `
    <div class="admin-title-row"><h1>${creating ? "Nova Box" : `Editar Box ${escapeHtml(box.id)}`}</h1><a class="secondary" href="/admin/boxes">Voltar à lista</a></div>
    <form id="box-form" class="box-form">
      <section class="panel fields">
        <div class="field"><label for="nome">Nome</label><input id="nome" name="nome" maxlength="100" required value="${escapeHtml(box.nome)}"></div>
        <div class="field"><label for="evento">Evento</label><input id="evento" name="evento" maxlength="100" required value="${escapeHtml(box.evento)}"></div>
        <div class="field"><label for="data_evento">Data do evento</label><input id="data_evento" name="data_evento" type="date" required value="${date}"></div>
        <div class="field"><label for="cor_ambientacao">Cor de ambientação</label><input id="cor_ambientacao" name="cor_ambientacao" type="color" value="${escapeHtml(box.cor_ambientacao || "#d99678")}" ${!creating && !box.cor_ambientacao ? "disabled" : ""}><label class="hint"><input id="usar-cor" type="checkbox" style="width:auto" ${creating || box.cor_ambientacao ? "checked" : ""} ${creating ? "disabled" : ""}> Usar cor derivada nesta Box</label></div>
        <label class="hint"><input name="visivel_home" type="checkbox" style="width:auto" ${box.visivel_home ? "checked" : ""}> Exibir na Home</label>
      </section>
      <fieldset class="panel"><legend>Apresentação</legend><div class="radio-row">
        <label><input type="radio" name="apresentacao_tipo" value="texto" ${box.apresentacao_tipo !== "imagem" ? "checked" : ""}> Texto</label>
        <label><input type="radio" name="apresentacao_tipo" value="imagem" ${box.apresentacao_tipo === "imagem" ? "checked" : ""}> Arte transparente</label>
      </div><div class="field" id="art-field"><label for="apresentacao_imagem">Arte PNG ou WebP</label><input id="apresentacao_imagem" name="apresentacao_imagem" type="file" accept="image/png,image/webp"><span class="hint">Gabarito recomendado: 1200 × 630 px (proporção 40:21), com fundo transparente.</span><span class="file-current">${box.apresentacao_imagem ? `Atual: ${escapeHtml(box.apresentacao_imagem)}` : ""}</span><img id="art-preview" style="width:min(100%,260px);aspect-ratio:40/21;object-fit:contain" ${box.apresentacao_imagem ? `src="${escapeHtml(box.apresentacao_imagem)}"` : "hidden"}></div></fieldset>
      <section class="panel"><div class="field"><label for="imagem_principal">Foto principal ${creating ? "(obrigatória)" : ""}</label><input id="imagem_principal" name="imagem_principal" type="file" accept="image/jpeg,image/png,image/webp,image/avif" ${creating ? "required" : ""}><span class="file-current">${box.imagem_principal ? `Atual: ${escapeHtml(box.imagem_principal)}` : ""}</span></div>
        <div class="previews"><div id="preview-main" class="hero-preview"><div class="hero-preview-photo"><img id="hero-preview-image" ${box.imagem_principal ? `src="${escapeHtml(box.imagem_principal)}"` : "hidden"}></div></div><div id="preview-small" class="hero-preview small"><div class="hero-preview-photo"><img id="hero-preview-image-small" ${box.imagem_principal ? `src="${escapeHtml(box.imagem_principal)}"` : "hidden"}></div></div></div>
        <p class="hint">Arraste a imagem ou ajuste os controles. O mesmo enquadramento vale para todos os formatos.</p>
        <label class="hint"><input id="usar-enquadramento" type="checkbox" style="width:auto" ${creating || box.imagem_foco_x !== null && box.imagem_foco_x !== undefined ? "checked" : ""} ${creating ? "disabled" : ""}> Usar enquadramento configurável</label>
        <div class="fields"><div class="field"><label for="imagem_foco_x">Horizontal <output id="out-x">${focusX}%</output></label><input id="imagem_foco_x" name="imagem_foco_x" type="range" min="0" max="100" step="1" value="${focusX}" ${!creating && (box.imagem_foco_x === null || box.imagem_foco_x === undefined) ? "disabled" : ""}></div><div class="field"><label for="imagem_foco_y">Vertical <output id="out-y">${focusY}%</output></label><input id="imagem_foco_y" name="imagem_foco_y" type="range" min="0" max="100" step="1" value="${focusY}" ${!creating && (box.imagem_foco_y === null || box.imagem_foco_y === undefined) ? "disabled" : ""}></div><div class="field"><label for="imagem_zoom">Zoom <output id="out-zoom">${zoom}×</output></label><input id="imagem_zoom" name="imagem_zoom" type="range" min="1" max="3" step="0.05" value="${zoom}" ${!creating && (box.imagem_zoom === null || box.imagem_zoom === undefined) ? "disabled" : ""}></div></div>
      </section>
      <section class="panel"><div class="field"><label for="musica">Música MP3 ${creating ? "(obrigatória)" : ""}</label><input id="musica" name="musica" type="file" accept="audio/mpeg,.mp3" ${creating ? "required" : ""}><span class="file-current">${box.musica ? `Atual: ${escapeHtml(box.musica)}` : ""}</span><audio id="music-preview" controls ${box.musica ? `src="${escapeHtml(box.musica)}"` : "hidden"}></audio></div></section>
      <div id="feedback" class="feedback"></div><div class="actions"><button type="submit">${creating ? "Criar Box" : "Salvar alterações"}</button></div>
    </form>
    ${creating ? "" : `<section class="panel"><h2>Convites</h2><div id="invitations" class="invitations"></div></section><section class="panel"><h2>Demonstração como ADM</h2><p>O vínculo ADM permite publicar conteúdo sem consumir convites e não aparece em Pessoas Especiais.</p><div class="actions"><button id="join-adm" type="button">Participar como ADM</button><button id="clean-content" class="danger" type="button">Limpar meu conteúdo nesta Box</button><button id="leave-adm" class="secondary" type="button">Remover participação ADM</button></div></section>`}
    <dialog id="confirm-dialog"><h2>Limpar conteúdo de demonstração?</h2><p>Serão removidos somente fotos, depoimentos e memórias criados pela sua conta nesta Box. Esta ação não pode ser desfeita.</p><div class="actions"><button id="cancel-clean" class="secondary">Cancelar</button><button id="confirm-clean" class="danger">Confirmar limpeza</button></div></dialog>`;
}

function wireForm(existing = {}) {
  const form = document.getElementById("box-form"), feedback = document.getElementById("feedback");
  const heroFile = document.getElementById("imagem_principal"), musicFile = document.getElementById("musica"), artFile = document.getElementById("apresentacao_imagem");
  const previews = [document.getElementById("hero-preview-image"), document.getElementById("hero-preview-image-small")];
  const x = document.getElementById("imagem_foco_x"), y = document.getElementById("imagem_foco_y"), zoom = document.getElementById("imagem_zoom");
  const usarCor = document.getElementById("usar-cor"), cor = document.getElementById("cor_ambientacao");
  usarCor.addEventListener("change", () => { cor.disabled = !usarCor.checked; });
  const usarEnquadramento = document.getElementById("usar-enquadramento");
  usarEnquadramento.addEventListener("change", () => { [x,y,zoom].forEach((input) => { input.disabled = !usarEnquadramento.checked; }); });
  function updatePreview() { const left=-Number(x.value)*.13; previews.forEach((img) => { img.style.left=`${left}%`; img.style.objectPosition=`50% ${y.value}%`; img.style.transform=`scale(${zoom.value})`; }); document.getElementById("out-x").value=`${x.value}%`; document.getElementById("out-y").value=`${y.value}%`; document.getElementById("out-zoom").value=`${zoom.value}×`; }
  [x,y,zoom].forEach((input) => input.addEventListener("input", updatePreview)); updatePreview();
  heroFile.addEventListener("change", () => { const file=heroFile.files[0]; if(!file)return; const url=URL.createObjectURL(file); previews.forEach((img)=>{img.src=url;img.hidden=false;}); });
  musicFile.addEventListener("change", () => { const file=musicFile.files[0], audio=document.getElementById("music-preview"); if(file){audio.src=URL.createObjectURL(file);audio.hidden=false;} });
  artFile.addEventListener("change", () => { const file=artFile.files[0], img=document.getElementById("art-preview"); if(file){img.src=URL.createObjectURL(file);img.hidden=false;} });
  let drag;
  document.getElementById("preview-main").addEventListener("pointerdown", (event) => { if (x.disabled) return; drag={px:event.clientX,py:event.clientY,x:+x.value,y:+y.value}; event.currentTarget.setPointerCapture(event.pointerId); });
  document.getElementById("preview-main").addEventListener("pointermove", (event) => { if(!drag)return; x.value=Math.max(0,Math.min(100,drag.x-(event.clientX-drag.px)/3)); y.value=Math.max(0,Math.min(100,drag.y-(event.clientY-drag.py)/2)); updatePreview(); });
  document.getElementById("preview-main").addEventListener("pointerup", () => { drag=null; });
  form.addEventListener("submit", async (event) => { event.preventDefault(); feedback.className="feedback"; feedback.textContent="Salvando…"; const button=form.querySelector("button[type=submit]"); button.disabled=true; try { const result=await api(creating?"/api/admin/boxes":`/api/admin/boxes/${editMatch[1]}`,{method:creating?"POST":"PUT",body:new FormData(form)}); location.href=`/admin/boxes/${result.id || editMatch[1]}/editar`; } catch(error){feedback.className="feedback error";feedback.textContent=error.message;button.disabled=false;} });
}

function renderInvites(invites) {
  document.getElementById("invitations").innerHTML = invites.map((invite) => { const link=`${location.origin}/convite/${invite.token}`; return `<div class="invite"><strong>${inviteLabels[invite.papel] || escapeHtml(invite.papel)}</strong><code>${escapeHtml(link)}</code><span>${invite.usos}/${invite.limite_usos ?? "∞"} · ${invite.ativo ? "ativo" : "inativo"}</span><button type="button" data-copy="${escapeHtml(link)}">Copiar</button></div>`; }).join("");
  document.querySelectorAll("[data-copy]").forEach((button)=>button.addEventListener("click",async()=>{await navigator.clipboard.writeText(button.dataset.copy);button.textContent="Copiado";}));
}

async function renderForm() {
  try {
    const data = creating ? { box:{} } : await api(`/api/admin/boxes/${editMatch[1]}`);
    app.innerHTML = formHtml(data.box); wireForm(data.box);
    if (!creating) {
      renderInvites(data.convites);
      const id=editMatch[1];
      document.getElementById("join-adm").disabled=data.participando_adm;
      document.getElementById("leave-adm").disabled=!data.participando_adm;
      document.getElementById("join-adm").onclick=async()=>{await api(`/api/admin/boxes/${id}/participacao`,{method:"POST"});location.reload();};
      document.getElementById("leave-adm").onclick=async()=>{await api(`/api/admin/boxes/${id}/participacao`,{method:"DELETE"});location.reload();};
      const dialog=document.getElementById("confirm-dialog");document.getElementById("clean-content").onclick=()=>dialog.showModal();document.getElementById("cancel-clean").onclick=()=>dialog.close();document.getElementById("confirm-clean").onclick=async()=>{const result=await api(`/api/admin/boxes/${id}/conteudo-proprio`,{method:"DELETE"});dialog.close();alert(`Removidos: ${result.removidos.fotos} fotos, ${result.removidos.depoimentos} depoimentos e ${result.removidos.memorias} memórias.`);};
    }
  } catch(error) { app.innerHTML=`<p class="feedback error">${escapeHtml(error.message)}</p>`; }
}

if (creating || editMatch) renderForm(); else renderList();
