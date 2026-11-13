/* LUZIAC Ops — tarefas da equipe com checklist por etapa (GitHub Pages + Supabase) */

/* ===== Configuração ===== */
const TEAM = [
  {n:"Carol",     role:"Coordenadora de Operações"},
  {n:"João",      role:"Filmmaker"},
  {n:"Jéssica",   role:"Designer"},
  {n:"Franklin",  role:"Desenvolvedor"},
  {n:"Pedro",     role:"CS e Gestor de Tráfego"},
  {n:"Guilherme", role:"Comercial"},
  {n:"Luiza",     role:"Redatora e Social Media"}];
const COLS = [
  ["fazer","A fazer","var(--muted)"],
  ["andamento","Em andamento","var(--pink)"],
  ["aguardando","Aguardando cliente","var(--warn)"],
  ["feito","Concluído","var(--good)"]];

/* ===== Estado e utilitários ===== */
const S = {sb:null, me:null, email:"", clients:[], tasks:[], templates:[], fClient:"", fWho:"", q:"", route:{tab:"quadro"},
  editTask:null, editItems:[], editTpl:null, tplItems:[]};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const initials = n => n ? String(n).normalize("NFD").replace(/[̀-ͯ]/g,"").slice(0,2).toUpperCase() : "–";
const todayISO = () => {const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const uid = () => Math.random().toString(36).slice(2,10);
const clientName = id => S.clients.find(c=>c.id===id)?.name || "Interno LUZIAC";
const person = n => TEAM.find(p=>p.n===n);
const ddmm = iso => { if(!iso) return ""; const [,m,d]=iso.split("-"); return `${d}/${m}` };
const av = (n,cls="") => `<span class="av ${cls} ${n?"":"none"}" title="${esc(n||"Sem responsável")}">${initials(n)}</span>`;

/* checklist: a tarefa fica com quem tem a próxima etapa pendente */
const items = t => Array.isArray(t.checklist) ? t.checklist : [];
const nextItem = t => items(t).find(i => !i.feito) || null;
const holder = t => t.status==="feito" ? null : (nextItem(t)?.resp || t.responsavel || null);
const progress = t => { const it=items(t); return {done:it.filter(i=>i.feito).length, total:it.length} };
const dueOf = t => nextItem(t)?.prazo || t.prazo || "";
const isLate = t => t.status!=="feito" && dueOf(t) && dueOf(t) < todayISO();
const isToday = t => t.status!=="feito" && dueOf(t) === todayISO();
/* tudo que envolve a pessoa e ainda está aberto: responsável da tarefa ou dono de alguma etapa pendente */
const involves = (t,n) => t.status!=="feito" && (t.responsavel===n || items(t).some(i=>!i.feito && i.resp===n));

const fromRow = r => ({id:r.id, titulo:r.titulo, responsavel:r.responsavel||"", cliente:r.cliente||"", status:r.status||"fazer",
  prazo:r.prazo||"", notas:r.notas||"", checklist:Array.isArray(r.checklist)?r.checklist:[], criadoEm:r.criado_em,
  concluidoEm:r.concluido_em||"", atualizadoEm:r.atualizado_em||r.criado_em});

/* ===== Modo claro/escuro (igual aos painéis) ===== */
(function(){ const root=document.documentElement, btn=$("mode-switch");
  const apply=m=>{ if(m==="light") root.dataset.mode="light"; else delete root.dataset.mode; btn.setAttribute("aria-checked",m==="light"); btn.setAttribute("aria-label",m==="light"?"Modo escuro":"Modo claro") };
  let saved=null; try{ saved=localStorage.getItem("dash-mode") }catch(e){}
  apply(saved==="light"?"light":"dark");
  btn.addEventListener("click",()=>{ const m=root.dataset.mode==="light"?"dark":"light"; apply(m); try{ localStorage.setItem("dash-mode",m) }catch(e){} });
})();

/* ===== Rotas: #quadro, #clientes, #cliente-<id>, #equipe, #pessoa-<nome>, #modelos ===== */
function parseRoute(){
  const h=(location.hash||"#quadro").slice(1);
  if(h.startsWith("cliente-")) return {tab:"clientes", client:h.slice(8)};
  if(h.startsWith("pessoa-")) return {tab:"equipe", person:TEAM.find(p=>slug(p.n)===h.slice(7))?.n};
  if(["quadro","clientes","equipe","modelos"].includes(h)) return {tab:h};
  return {tab:"quadro"};
}
window.addEventListener("hashchange",()=>{ S.route=parseRoute(); render(); window.scrollTo({top:0}) });

/* ===== Render ===== */
function render(){
  document.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("active",a.dataset.tab===S.route.tab));
  const home=S.route.tab==="quadro";
  document.querySelector(".hero").hidden=!home;
  renderHello(); renderForYou();
  const r=S.route;
  $("view").innerHTML = r.tab==="clientes" ? (r.client?viewClient(r.client):viewClients())
    : r.tab==="equipe" ? (r.person?viewPerson(r.person):viewTeam())
    : r.tab==="modelos" ? viewTemplates() : viewBoard();
  bindView();
}

function renderHello(){
  const first=S.me||"";
  const mine=S.tasks.filter(t=>holder(t)===S.me && t.status!=="aguardando").length;
  $("hello").innerHTML = S.me
    ? `Olá, ${esc(first)}<span class="grad">.</span> <span class="soft">${mine?`${mine} ${mine===1?"tarefa espera":"tarefas esperam"} por você.`:"Nada esperando por você."}</span>`
    : `Olá<span class="grad">.</span>`;
  $("meAv").textContent=initials(S.me); $("meName").textContent=S.me||"";
}

/* avisos "Para você" */
function renderForYou(){
  if(!S.me){ $("foryou").innerHTML=""; return }
  let lastSeen=""; try{ lastSeen=localStorage.getItem("ops-seen-"+slug(S.me))||"" }catch(_){}
  const out=[], seen=new Set();
  const push=(t,kind,k,s)=>{ if(seen.has(t.id)) return; seen.add(t.id); out.push({t,kind,k,s}) };
  const mineOpen=S.tasks.filter(t=>involves(t,S.me));
  mineOpen.filter(t=>holder(t)===S.me && isLate(t)).forEach(t=>push(t,"late","Atrasada",`${nextItem(t)?.texto||"Tarefa"} · era ${ddmm(dueOf(t))}`));
  mineOpen.filter(t=>holder(t)===S.me && isToday(t)).forEach(t=>push(t,"today","Vence hoje",nextItem(t)?.texto||"Entrega hoje"));
  mineOpen.filter(t=>holder(t)===S.me && t.status!=="aguardando" && lastSeen && t.atualizadoEm>lastSeen)
    .forEach(t=>push(t,"new","Chegou para você",`${nextItem(t)?.texto||"Tarefa"}${prevStep(t)?` · depois de ${prevStep(t)}`:""}`));
  mineOpen.filter(t=>holder(t)===S.me && t.status!=="aguardando")
    .sort((a,b)=>(dueOf(a)||"9999").localeCompare(dueOf(b)||"9999"))
    .forEach(t=>push(t,"","Esperando você",`${nextItem(t)?.texto||"Tarefa"}${dueOf(t)?` · até ${ddmm(dueOf(t))}`:""}`));
  $("foryou").innerHTML = out.length
    ? out.slice(0,8).map(o=>`<button type="button" class="fy ${o.kind}" data-task="${esc(o.t.id)}"><span class="k">${o.k}</span><span class="t">${esc(o.t.titulo)}</span><span class="s">${esc(clientName(o.t.cliente))} · ${esc(o.s)}</span></button>`).join("")
    : `<div class="fy-empty">Tudo em dia por aqui.</div>`;
}
const prevStep = t => { const it=items(t), i=it.findIndex(x=>!x.feito); const p=i>0?it[i-1]:null; return p&&p.resp?`${p.resp}`:"" };
function markSeen(){ if(!S.me) return; try{ localStorage.setItem("ops-seen-"+slug(S.me), new Date().toISOString()) }catch(_){} }

/* cartão de tarefa */
function tcard(t, drag=true){
  const p=progress(t), h=holder(t), n=nextItem(t), due=dueOf(t);
  const dueCls=isLate(t)?"late":isToday(t)?"today":"";
  return `<div class="tcard" draggable="${drag}" data-task="${esc(t.id)}" tabindex="0" role="button" aria-label="Abrir ${esc(t.titulo)}">
    <span class="ct">${esc(clientName(t.cliente))}</span>
    <span class="tt">${esc(t.titulo)}</span>
    ${p.total?`<span class="prog"><span class="bar"><i style="width:${p.done/p.total*100}%"></i></span>${p.done}/${p.total}</span>`:""}
    ${t.status==="feito"?`<span class="tmeta"><span class="chip done">Concluída${t.concluidoEm?` · ${ddmm(t.concluidoEm.slice(0,10))}`:""}</span></span>`
      :`<span class="with">${av(h,"sm")}<span>${h?`Com <b>${esc(h)}</b>`:"Sem responsável"}${n?` · ${esc(n.texto)}`:""}</span></span>`}
    ${t.status!=="feito"&&(due||t.status==="aguardando")?`<span class="tmeta">${t.status==="aguardando"?`<span class="chip wait">Aguardando cliente</span>`:""}${due?`<span class="due ${dueCls}">${dueCls==="late"?"Atrasada · ":dueCls==="today"?"Hoje · ":""}${ddmm(due)}</span>`:""}</span>`:""}
  </div>`;
}

function filtered(){
  const q=S.q.trim().toLowerCase();
  return S.tasks.filter(t=>(!S.fClient||t.cliente===S.fClient)&&(!S.fWho||involves(t,S.fWho)||(t.status==="feito"&&t.responsavel===S.fWho))&&
    (!q||t.titulo.toLowerCase().includes(q)||clientName(t.cliente).toLowerCase().includes(q)||items(t).some(i=>(i.texto||"").toLowerCase().includes(q))));
}
const sortOpen=(a,b)=>Number(isLate(b))-Number(isLate(a))||(dueOf(a)||"9999").localeCompare(dueOf(b)||"9999");

function boardHTML(list, addPreset={}){
  return `<div class="board-scroll"><div class="board">${COLS.map(([k,l,c])=>{
    let col=list.filter(t=>t.status===k);
    const total=col.length;
    col = k==="feito" ? col.sort((a,b)=>(b.concluidoEm||"").localeCompare(a.concluidoEm||"")).slice(0,25) : col.sort(sortOpen);
    return `<div class="col" data-col="${k}"><div class="col-h"><span><i style="background:${c}"></i>${l}</span><b>${total}</b></div>
      ${col.map(t=>tcard(t)).join("")||'<div class="empty">Nada aqui.</div>'}
      ${k!=="feito"?`<button type="button" class="add" data-add='${esc(JSON.stringify({...addPreset,status:k}))}'>+ adicionar</button>`:""}</div>`;
  }).join("")}</div></div>`;
}

function clientOptions(sel, withAll){
  const o=[...S.clients].sort((a,b)=>a.name.localeCompare(b.name,"pt")).map(c=>`<option value="${esc(c.id)}" ${c.id===sel?"selected":""}>${esc(c.name)}</option>`).join("");
  return (withAll?`<option value="">Todos os clientes</option>`:`<option value="">Interno LUZIAC</option>`)+o;
}
const teamOptions=(sel,empty="Sem responsável")=>`<option value="">${empty}</option>`+TEAM.map(p=>`<option ${p.n===sel?"selected":""}>${p.n}</option>`).join("");

function viewBoard(){
  return `<div class="filters">
      <input class="search" id="q" type="search" placeholder="Buscar tarefa ou etapa…" value="${esc(S.q)}" aria-label="Buscar">
      <select class="pill-select" id="fClient" aria-label="Cliente">${clientOptions(S.fClient,true)}</select>
      <select class="pill-select" id="fWho" aria-label="Pessoa">${teamOptions(S.fWho,"Toda a equipe")}</select>
      ${S.fClient||S.fWho||S.q?`<button class="chipx" id="clear" type="button">Limpar filtros ✕</button>`:""}
    </div>${boardHTML(filtered())}`;
}

function viewClients(){
  const list=[...S.clients].sort((a,b)=>a.name.localeCompare(b.name,"pt")).map(c=>{
    const open=S.tasks.filter(t=>t.cliente===c.id&&t.status!=="feito");
    const late=open.filter(isLate).length, wait=open.filter(t=>t.status==="aguardando").length;
    const holders=[...new Set(open.map(holder).filter(Boolean))];
    return `<a class="gcard" href="#cliente-${esc(c.id)}"><span class="gn">${esc(c.name)}</span>
      <span class="nums"><div><b>${open.length}</b><small>abertas</small></div><div class="${wait?"warn":""}"><b>${wait}</b><small>com cliente</small></div><div class="${late?"bad":""}"><b>${late}</b><small>atrasadas</small></div></span>
      <span class="avs">${holders.slice(0,6).map(n=>av(n,"sm")).join("")||'<span class="gs">Nenhuma tarefa aberta</span>'}</span></a>`;
  }).join("");
  return `<div class="sec-h"><h2 class="sec-title">Clientes</h2><button class="btn" id="newClient" type="button">+ cliente</button></div><div class="grid">${list}</div>`;
}

function viewClient(id){
  const c=S.clients.find(x=>x.id===id);
  if(!c) return `<a class="link-btn back" href="#clientes">← Clientes</a><p class="muted">Cliente não encontrado.</p>`;
  const list=S.tasks.filter(t=>t.cliente===id);
  return `<a class="link-btn back" href="#clientes">← Clientes</a>
    <div class="page-head"><div><span class="label">Cliente</span><h2 class="sec-title" style="font-size:32px">${esc(c.name)}</h2></div>
    <button class="btn primary" type="button" data-add='${esc(JSON.stringify({cliente:id}))}'>+ tarefa para ${esc(c.name)}</button></div>
    ${boardHTML(list,{cliente:id})}`;
}

function viewTeam(){
  const wk=Date.now()-7*864e5;
  return `<div class="sec-h"><h2 class="sec-title">Equipe</h2></div><div class="grid">${TEAM.map(p=>{
    const mine=S.tasks.filter(t=>involves(t,p.n));
    const waiting=S.tasks.filter(t=>holder(t)===p.n&&t.status!=="aguardando").length;
    const late=S.tasks.filter(t=>holder(t)===p.n&&isLate(t)).length;
    const done=S.tasks.reduce((s,t)=>s+items(t).filter(i=>i.feito&&i.resp===p.n&&i.feitoEm&&Date.parse(i.feitoEm)>=wk).length,0);
    return `<a class="gcard" href="#pessoa-${slug(p.n)}"><span class="who" style="display:flex;gap:10px;align-items:center">${av(p.n,"lg")}<span><span class="gn">${p.n}</span><br><span class="gs">${p.role}</span></span></span>
      <span class="nums"><div><b>${waiting}</b><small>com ela/ele</small></div><div class="${late?"bad":""}"><b>${late}</b><small>atrasadas</small></div><div><b>${mine.length}</b><small>envolvida(o)</small></div><div><b>${done}</b><small>etapas na semana</small></div></span></a>`;
  }).join("")}</div>`;
}

function viewPerson(n){
  const p=person(n);
  if(!p) return `<a class="link-btn back" href="#equipe">← Equipe</a><p class="muted">Pessoa não encontrada.</p>`;
  const mine=S.tasks.filter(t=>involves(t,n)).sort(sortOpen);
  const byClient={};
  mine.forEach(t=>{ (byClient[t.cliente||""]??=[]).push(t) });
  const groups=Object.keys(byClient).sort((a,b)=>clientName(a).localeCompare(clientName(b),"pt"));
  const rows=groups.map(cid=>`<div class="group"><div class="group-h"><span class="gname">${esc(clientName(cid))}</span><span class="gcount">${byClient[cid].length}</span></div><div class="rows">${
    byClient[cid].map(t=>{
      const h=holder(t), nx=nextItem(t);
      const steps=items(t).filter(i=>i.resp===n&&!i.feito);
      const stepsHTML=steps.map(i=>{
        const isNext=nx&&nx.id===i.id;
        return `<label class="step-check ${isNext?"next":"later"}" data-stop><input type="checkbox" data-check="${esc(t.id)}|${esc(i.id)}" ${isNext?"":"disabled"}>${esc(i.texto)}${i.prazo?` <span class="when">até ${ddmm(i.prazo)}</span>`:""}${isNext?"":` <span class="when">· depois</span>`}</label>`;
      }).join("") || `<span class="sub">Responsável pela tarefa</span>`;
      const due=dueOf(t), dc=isLate(t)?"late":isToday(t)?"today":"";
      return `<div class="trow" data-task="${esc(t.id)}"><div><div class="tt">${esc(t.titulo)}</div><div class="sub">${COLS.find(c=>c[0]===t.status)?.[1]||""} · ${progress(t).done}/${progress(t).total} etapas${due?` · <span class="due ${dc}">${ddmm(due)}</span>`:""}</div></div>
        <div class="mysteps">${stepsHTML}</div>
        <div class="with">${av(h,"sm")}<span>${h===n?"<b>Com você agora</b>":h?`Com ${esc(h)}`:"—"}</span></div></div>`;
    }).join("")}</div></div>`).join("");
  return `<a class="link-btn back" href="#equipe">← Equipe</a>
    <div class="page-head"><div class="who">${av(n,"lg")}<div><span class="label">${esc(p.role)}</span><h2 class="sec-title" style="font-size:32px">${esc(n)}</h2></div></div>
    <button class="btn primary" type="button" data-add='${esc(JSON.stringify({responsavel:n}))}'>+ tarefa para ${esc(n)}</button></div>
    ${rows||`<p class="muted">Nada aberto com ${esc(n)} agora.</p>`}`;
}

function viewTemplates(){
  return `<div class="sec-h"><div><h2 class="sec-title">Modelos de tarefa</h2><p class="muted" style="margin:4px 0 0">Ao criar uma tarefa a partir de um modelo, o checklist já vem pronto.</p></div><button class="btn" id="newTpl" type="button">+ modelo</button></div>
    <div class="grid">${S.templates.map(t=>`<button type="button" class="gcard" data-tpl="${esc(t.id)}"><span class="gn">${esc(t.nome)}</span>
      <ol class="tpl-steps">${(t.itens||[]).map(i=>`<li>${esc(i.texto)}${i.resp?` <span>· ${esc(i.resp)}</span>`:""}</li>`).join("")}</ol></button>`).join("")||'<p class="muted">Nenhum modelo ainda.</p>'}</div>`;
}

/* ===== Eventos da área principal ===== */
function bindView(){
  const q=$("q"); if(q) q.oninput=e=>{ S.q=e.target.value; const pos=e.target.selectionStart; render(); const n=$("q"); n.focus(); try{n.setSelectionRange(pos,pos)}catch(_){} };
  const fc=$("fClient"); if(fc) fc.onchange=e=>{ S.fClient=e.target.value; render() };
  const fw=$("fWho"); if(fw) fw.onchange=e=>{ S.fWho=e.target.value; render() };
  const cl=$("clear"); if(cl) cl.onclick=()=>{ S.fClient=""; S.fWho=""; S.q=""; render() };
  const nc=$("newClient"); if(nc) nc.onclick=()=>{ $("cNome").value=""; $("dClient").showModal() };
  const nt=$("newTpl"); if(nt) nt.onclick=()=>openTpl(null);
}
document.addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){ e.target.closest("dialog").close(); return }
  if(e.target.closest("[data-stop]")) return;
  const add=e.target.closest("[data-add]"); if(add){ openTask(null, JSON.parse(add.dataset.add)); return }
  const tp=e.target.closest("[data-tpl]"); if(tp){ openTpl(S.templates.find(x=>x.id===tp.dataset.tpl)); return }
  const tk=e.target.closest("[data-task]"); if(tk && !e.target.closest("dialog")){ openTask(S.tasks.find(t=>t.id===tk.dataset.task)); return }
});
document.addEventListener("keydown",e=>{ if(e.key==="Enter"){ const tk=e.target.closest?.(".tcard"); if(tk) openTask(S.tasks.find(t=>t.id===tk.dataset.task)) } });
document.addEventListener("change",async e=>{
  const c=e.target.closest?.("[data-check]"); if(!c) return;
  const [tid,iid]=c.dataset.check.split("|"); c.disabled=true;
  await toggleItem(tid,iid,c.checked);
});

/* arrastar entre etapas */
let dragId=null;
document.addEventListener("dragstart",e=>{ const c=e.target.closest?.(".tcard"); if(!c) return; dragId=c.dataset.task; c.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; try{e.dataTransfer.setData("text/plain",dragId)}catch(_){} });
document.addEventListener("dragend",e=>{ e.target.closest?.(".tcard")?.classList.remove("dragging"); document.querySelectorAll(".col.over").forEach(x=>x.classList.remove("over")); dragId=null });
document.addEventListener("dragover",e=>{ const col=e.target.closest?.(".col"); if(!col||!dragId) return; e.preventDefault(); document.querySelectorAll(".col.over").forEach(x=>x!==col&&x.classList.remove("over")); col.classList.add("over") });
document.addEventListener("drop",e=>{ const col=e.target.closest?.(".col"); if(!col||!dragId) return; e.preventDefault(); col.classList.remove("over"); setStatus(dragId,col.dataset.col); dragId=null });

/* ===== Dados ===== */
async function loadAll(){
  const [c,t,m]=await Promise.all([
    S.sb.from("clients").select("id,name"),
    S.sb.from("tasks").select("*"),
    S.sb.from("templates").select("*").order("nome")]);
  if(c.error||t.error){ $("sync").textContent="sem conexão com os dados"; return }
  S.clients=c.data; S.tasks=t.data.map(fromRow); S.templates=m.error?[]:m.data;
  $("sync").textContent="sincronizado ao vivo"; render();
}
let reloadT=null;
const reloadSoon=()=>{ clearTimeout(reloadT); reloadT=setTimeout(loadAll,300) };
function subscribe(){
  S.sb.channel("ops")
    .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},reloadSoon)
    .on("postgres_changes",{event:"*",schema:"public",table:"clients"},reloadSoon)
    .on("postgres_changes",{event:"*",schema:"public",table:"templates"},reloadSoon).subscribe();
}
/* etapa automática pelo checklist */
function autoStatus(status, list){
  if(!list.length) return status;
  const done=list.filter(i=>i.feito).length;
  if(done===list.length) return "feito";
  if(status==="feito") return "andamento";
  if(done>0 && status==="fazer") return "andamento";
  return status;
}
async function saveRow(id,row){
  const r = id ? await S.sb.from("tasks").update(row).eq("id",id) : await S.sb.from("tasks").insert(row);
  if(r.error) throw r.error;
}
async function setStatus(id,status){
  const t=S.tasks.find(x=>x.id===id); if(!t||t.status===status) return;
  t.status=status; t.concluidoEm=status==="feito"?new Date().toISOString():""; render();
  try{ await saveRow(id,{status,concluido_em:t.concluidoEm||null}) }catch(_){ loadAll() }
}
async function toggleItem(tid,iid,on){
  const t=S.tasks.find(x=>x.id===tid); if(!t) return;
  const list=items(t).map(i=>i.id===iid?{...i,feito:on,feitoEm:on?new Date().toISOString():""}:i);
  const status=autoStatus(t.status,list);
  const concl=status==="feito"?(t.concluidoEm||new Date().toISOString()):"";
  Object.assign(t,{checklist:list,status,concluidoEm:concl}); render();
  try{ await saveRow(tid,{checklist:list,status,concluido_em:concl||null}) }catch(_){ loadAll() }
}

/* ===== Modal de tarefa ===== */
function openTask(t, preset={}){
  S.editTask=t?t.id:null;
  S.editItems=t?items(t).map(i=>({...i})):[];
  $("dTaskTitle").textContent=t?"Tarefa":"Nova tarefa";
  $("tTpl").innerHTML=`<option value="">${S.templates.length?"Usar um modelo…":"Nenhum modelo criado ainda"}</option>`+S.templates.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("");
  $("tTitulo").value=t?.titulo||"";
  $("tCliente").innerHTML=clientOptions(t?.cliente??preset.cliente??(S.fClient||""),false);
  $("tResp").innerHTML=teamOptions(t?.responsavel??preset.responsavel??"");
  $("tPrazo").value=t?.prazo||"";
  $("tStatus").innerHTML=COLS.map(([k,l])=>`<option value="${k}" ${k===(t?.status||preset.status||"fazer")?"selected":""}>${l}</option>`).join("");
  $("tNotas").value=t?.notas||"";
  $("tDel").hidden=!t; $("tConfirm").hidden=true; $("tErr").hidden=true;
  drawItems();
  $("dTask").showModal();
  if(!t) setTimeout(()=>$("tTitulo").focus(),30);
}
function drawItems(){
  const nx=S.editItems.find(i=>!i.feito);
  $("tItems").innerHTML=S.editItems.map((i,ix)=>`<li class="${i.feito?"done":""} ${nx&&nx.id===i.id?"cur":""}" data-ix="${ix}">
    <input type="checkbox" data-f="feito" ${i.feito?"checked":""} aria-label="Concluída">
    <input type="text" class="txt" data-f="texto" value="${esc(i.texto)}" placeholder="Etapa" maxlength="120" aria-label="Etapa">
    <select data-f="resp" aria-label="Responsável pela etapa">${teamOptions(i.resp||"","Quem?")}</select>
    <input type="date" data-f="prazo" value="${esc(i.prazo||"")}" aria-label="Prazo da etapa">
    <span class="mini"><button type="button" data-mv="-1" aria-label="Subir">↑</button><button type="button" data-mv="1" aria-label="Descer">↓</button><button type="button" data-rm aria-label="Remover">×</button></span></li>`).join("")
    || `<li style="display:block" class="muted">Nenhuma etapa ainda. Escolha um modelo acima ou adicione abaixo.</li>`;
}
function itemsEditor(listEl, getArr, redraw){
  listEl.addEventListener("input",e=>{ const li=e.target.closest("li[data-ix]"); if(!li) return; const it=getArr()[+li.dataset.ix], f=e.target.dataset.f; if(!f) return;
    if(f==="feito"){ it.feito=e.target.checked; it.feitoEm=it.feito?new Date().toISOString():""; redraw() } else it[f]=e.target.value });
  listEl.addEventListener("change",e=>{ if(e.target.dataset.f==="feito") return; const li=e.target.closest("li[data-ix]"); if(li){ const f=e.target.dataset.f; if(f) getArr()[+li.dataset.ix][f]=e.target.value } });
  listEl.addEventListener("click",e=>{ const li=e.target.closest("li[data-ix]"); if(!li) return; const ix=+li.dataset.ix, arr=getArr();
    if(e.target.closest("[data-rm]")){ arr.splice(ix,1); redraw() }
    const mv=e.target.closest("[data-mv]"); if(mv){ const j=ix+ +mv.dataset.mv; if(j>=0&&j<arr.length){ [arr[ix],arr[j]]=[arr[j],arr[ix]]; redraw() } } });
}
itemsEditor($("tItems"),()=>S.editItems,drawItems);
$("tAddItem").onclick=()=>{ S.editItems.push({id:uid(),texto:"",resp:"",prazo:"",feito:false}); drawItems(); $("tItems").querySelector("li:last-child .txt")?.focus() };
/* modelo: preenche o checklist (se já houver etapas, as do modelo entram no fim) */
$("tTpl").onchange=e=>{ const m=S.templates.find(x=>x.id===e.target.value); if(!m) return;
  const keep=S.editItems.filter(i=>(i.texto||"").trim());
  S.editItems=keep.concat((m.itens||[]).map(i=>({id:uid(),texto:i.texto,resp:i.resp||"",prazo:"",feito:false})));
  if(!$("tTitulo").value.trim()) $("tTitulo").value=m.nome+" · ";
  e.target.value=""; drawItems() };
$("fTask").onsubmit=async e=>{
  e.preventDefault();
  const prev=S.editTask?S.tasks.find(t=>t.id===S.editTask):null;
  const list=S.editItems.filter(i=>i.texto.trim()).map(i=>({...i,texto:i.texto.trim()}));
  let status=$("tStatus").value;
  if(!prev || status===prev.status) status=autoStatus(status,list);
  const concl=status==="feito"?(prev?.status==="feito"&&prev.concluidoEm?prev.concluidoEm:new Date().toISOString()):"";
  const row={titulo:$("tTitulo").value.trim(),cliente:$("tCliente").value||null,responsavel:$("tResp").value||null,prazo:$("tPrazo").value||null,
    status,notas:$("tNotas").value.trim()||null,checklist:list,concluido_em:concl||null};
  if(!row.titulo) return;
  try{ await saveRow(prev?.id,row); $("dTask").close(); loadAll() }
  catch(err){ $("tErr").hidden=false; $("tErr").textContent="Não deu para salvar. Confira a conexão e tente de novo." }
};
$("tDel").onclick=()=>{ $("tConfirm").hidden=false };
$("tDelNo").onclick=()=>{ $("tConfirm").hidden=true };
$("tDelYes").onclick=async()=>{ const r=await S.sb.from("tasks").delete().eq("id",S.editTask); if(r.error){ $("tErr").hidden=false; $("tErr").textContent="Não deu para excluir agora."; return } $("dTask").close(); loadAll() };

/* ===== Modelos ===== */
function openTpl(m){
  S.editTpl=m?m.id:null; S.tplItems=m?(m.itens||[]).map(i=>({...i})):[{texto:"",resp:""}];
  $("dTplTitle").textContent=m?"Editar modelo":"Novo modelo"; $("mNome").value=m?.nome||"";
  $("mDel").hidden=!m; $("mConfirm").hidden=true; drawTpl(); $("dTpl").showModal();
}
function drawTpl(){
  $("mItems").classList.add("tpl");
  $("mItems").innerHTML=S.tplItems.map((i,ix)=>`<li data-ix="${ix}"><span class="num">${ix+1}</span>
    <input type="text" data-f="texto" value="${esc(i.texto)}" placeholder="Etapa" maxlength="120" aria-label="Etapa">
    <select data-f="resp" aria-label="Responsável padrão">${teamOptions(i.resp||"","Definir na tarefa")}</select>
    <span class="mini"><button type="button" data-mv="-1" aria-label="Subir">↑</button><button type="button" data-mv="1" aria-label="Descer">↓</button><button type="button" data-rm aria-label="Remover">×</button></span></li>`).join("");
}
itemsEditor($("mItems"),()=>S.tplItems,drawTpl);
$("mAddItem").onclick=()=>{ S.tplItems.push({texto:"",resp:""}); drawTpl(); $("mItems").querySelector("li:last-child input")?.focus() };
$("fTpl").onsubmit=async e=>{
  e.preventDefault();
  const row={nome:$("mNome").value.trim(),itens:S.tplItems.filter(i=>i.texto.trim()).map(i=>({texto:i.texto.trim(),resp:i.resp||""}))};
  if(!row.nome) return;
  const r=S.editTpl?await S.sb.from("templates").update(row).eq("id",S.editTpl):await S.sb.from("templates").insert(row);
  if(!r.error){ $("dTpl").close(); loadAll() }
};
$("mDel").onclick=()=>{ $("mConfirm").hidden=false };
$("mDelNo").onclick=()=>{ $("mConfirm").hidden=true };
$("mDelYes").onclick=async()=>{ await S.sb.from("templates").delete().eq("id",S.editTpl); $("dTpl").close(); loadAll() };

/* ===== Clientes ===== */
$("fClient").onsubmit=async e=>{
  e.preventDefault(); const name=$("cNome").value.trim(); if(!name) return;
  let id=slug(name)||"cliente"; if(S.clients.some(c=>c.id===id)) id+="-"+uid().slice(0,4);
  const r=await S.sb.from("clients").insert({id,name}); if(!r.error){ $("dClient").close(); loadAll() }
};

/* ===== Login e identidade ===== */
function askWho(){
  $("whoGrid").innerHTML=TEAM.map(p=>`<button type="button" data-who="${esc(p.n)}">${av(p.n)}<span><b>${p.n}</b><small>${p.role}</small></span></button>`).join("");
  $("dWho").showModal();
}
$("whoGrid").onclick=async e=>{ const b=e.target.closest("[data-who]"); if(!b) return;
  S.me=b.dataset.who; await S.sb.auth.updateUser({data:{nome:S.me}}); $("dWho").close(); render() };
$("dWho").addEventListener("cancel",e=>e.preventDefault());
$("meBtn").onclick=()=>{ $("dMeTitle").textContent=S.me||"Sua conta"; $("dMeEmail").textContent=S.email; $("dMe").showModal() };
$("changeWho").onclick=()=>{ $("dMe").close(); askWho() };
$("logout").onclick=async()=>{ await S.sb.auth.signOut(); location.hash=""; location.reload() };
$("newTask").onclick=()=>openTask(null, S.route.client?{cliente:S.route.client}:S.route.person?{responsavel:S.route.person}:{});

function start(session){
  $("login").hidden=true; $("app").hidden=false;
  S.email=session.user.email||"";
  S.me=person(session.user.user_metadata?.nome)?.n||null;
  S.route=parseRoute(); render(); loadAll().then(()=>{ if(!S.me) askWho() }); subscribe();
  window.addEventListener("beforeunload",markSeen);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") markSeen() });
}
$("fLogin").onsubmit=async e=>{
  e.preventDefault(); $("lErr").hidden=true; $("lBtn").disabled=true;
  const {error}=await S.sb.auth.signInWithPassword({email:$("lEmail").value.trim(),password:$("lPass").value});
  $("lBtn").disabled=false;
  if(error){ $("lErr").hidden=false; $("lErr").textContent="E-mail ou senha incorretos." }
};

(async()=>{
  const cfg=window.OPS_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase){ $("login").hidden=false; $("lErr").hidden=false; $("lErr").textContent="Sistema ainda não configurado."; return }
  S.sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const {data}=await S.sb.auth.getSession();
  let started=false;
  if(data.session){ started=true; start(data.session) } else $("login").hidden=false;
  S.sb.auth.onAuthStateChange((_ev,session)=>{ if(session&&!started){ started=true; start(session) } });
})();
