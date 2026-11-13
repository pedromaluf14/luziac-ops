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
const S = {sb:null, me:null, email:"", clients:[], tasks:[], templates:[], alerts:[], torre:null, showSeen:false, fClient:"", fWho:"", q:"", route:{tab:"quadro"},
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
  if(["quadro","clientes","equipe","modelos","torre"].includes(h)) return {tab:h};
  return {tab:"quadro"};
}
window.addEventListener("hashchange",()=>{ S.route=parseRoute(); render(); window.scrollTo({top:0}) });

/* ===== Render ===== */
function render(){
  document.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("active",a.dataset.tab===S.route.tab));
  document.querySelectorAll("[data-tab]").forEach(a=>{ if(!a.dataset.ic){ a.dataset.ic=1; a.insertAdjacentHTML("afterbegin",ic({quadro:"board",clientes:"building",equipe:"users",modelos:"copy",torre:"radar"}[a.dataset.tab])) } });
  const home=S.route.tab==="quadro";
  document.querySelector(".hero").hidden=!home;
  renderHello(); renderForYou(); renderTorreBadge();
  const r=S.route;
  $("view").innerHTML = r.tab==="clientes" ? (r.client?viewClient(r.client):viewClients())
    : r.tab==="equipe" ? (r.person?viewPerson(r.person):viewTeam())
    : r.tab==="modelos" ? viewTemplates() : r.tab==="torre" ? viewTorre() : viewBoard();
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

/* ícones (traço fino, herdam a cor do texto) */
const ICON={
  list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  hourglass:'<path d="M6 2h12M6 22h12M7 2c0 5 10 6 10 10S7 17 7 22M17 2c0 5-10 6-10 10s10 5 10 10"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>',
  arrow:'<path d="M9 6l6 6-6 6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  building:'<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'};
const ic=(k,cls="")=>`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

function clientStats(id){
  const open=S.tasks.filter(t=>t.cliente===id&&t.status!=="feito");
  const al=S.alerts.filter(a=>a.ativo&&a.cliente===id&&!a.visto_por);
  return {open, late:open.filter(isLate).length, wait:open.filter(t=>t.status==="aguardando").length,
    doing:open.filter(t=>t.status==="andamento").length, alerts:al.length, urgent:al.some(a=>a.nivel==="urgente"),
    next:open.map(dueOf).filter(Boolean).sort()[0]||"", holders:[...new Set(open.map(holder).filter(Boolean))]};
}
const monoTxt=name=>{ const w=String(name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/).filter(Boolean);
  return (w.length>1?w[0][0]+w[1][0]:w[0].slice(0,2)).toUpperCase() };
const mono=name=>`<span class="mono">${esc(monoTxt(name))}</span>`;
function viewClients(){
  const q=(S.cq||"").trim().toLowerCase();
  const all=[...S.clients].sort((a,b)=>a.name.localeCompare(b.name,"pt")).filter(c=>!q||c.name.toLowerCase().includes(q));
  const rows=all.map(c=>({c,st:clientStats(c.id)}));
  const active=rows.filter(r=>r.st.open.length||r.st.alerts)
    .sort((a,b)=>(b.st.urgent-a.st.urgent)||(b.st.late-a.st.late)||(b.st.alerts-a.st.alerts)||(b.st.open.length-a.st.open.length));
  const quiet=rows.filter(r=>!r.st.open.length&&!r.st.alerts);
  const pill=(k,n,label,cls="")=>n?`<span class="kp ${cls}">${ic(k)}<b>${n}</b> ${label}</span>`:"";
  const cards=active.map(({c,st})=>`<a class="ccard ${st.urgent||st.late?"hot":""}" href="#cliente-${esc(c.id)}">
      <span class="cc-top">${mono(c.name)}<span class="cc-name">${esc(c.name)}</span>${ic("arrow","go")}</span>
      <span class="kps">${pill("list",st.open.length,st.open.length===1?"aberta":"abertas")}${pill("hourglass",st.wait,"com cliente","warn")}${pill("alert",st.late,st.late===1?"atrasada":"atrasadas","bad")}${pill("radar",st.alerts,st.alerts===1?"alerta":"alertas",st.urgent?"bad":"warn")}</span>
      <span class="cc-foot"><span class="avs">${st.holders.slice(0,5).map(n=>av(n,"sm")).join("")}</span>${st.next?`<span class="muted">${ic("clock")} próxima entrega ${ddmm(st.next)}</span>`:""}</span></a>`).join("");
  return `<div class="sec-h"><div><h2 class="sec-title">Clientes</h2><p class="muted" style="margin:4px 0 0">${active.length} com movimento · ${quiet.length} sem tarefas abertas</p></div>
      <div class="sec-actions"><label class="search-ic">${ic("search")}<input class="search" id="cq" type="search" placeholder="Buscar cliente" value="${esc(S.cq||"")}" aria-label="Buscar cliente"></label>
      <button class="btn" id="newClient" type="button">${ic("plus")} Cliente</button></div></div>
    ${cards?`<div class="cgrid">${cards}</div>`:""}
    ${quiet.length?`<div class="quiet"><span class="label">Sem tarefas abertas</span><div class="qlist">${quiet.map(({c})=>`<a class="qchip" href="#cliente-${esc(c.id)}">${mono(c.name)}${esc(c.name)}</a>`).join("")}</div></div>`:""}
    ${!all.length?`<p class="muted">Nenhum cliente encontrado.</p>`:""}`;
}

function viewClient(id){
  const c=S.clients.find(x=>x.id===id);
  if(!c) return `<a class="link-btn back" href="#clientes">← Clientes</a><p class="muted">Cliente não encontrado.</p>`;
  const list=S.tasks.filter(t=>t.cliente===id);
  const al=S.alerts.filter(a=>a.ativo&&a.cliente===id&&!a.visto_por);
  return `<a class="link-btn back" href="#clientes">← Clientes</a>
    <div class="page-head"><div class="who">${mono(c.name).replace('class="mono"','class="mono lg"')}<div><span class="label">Cliente</span><h2 class="sec-title" style="font-size:32px">${esc(c.name)}</h2></div></div>
    <button class="btn primary" type="button" data-add='${esc(JSON.stringify({cliente:id}))}'>+ tarefa para ${esc(c.name)}</button></div>
    ${al.length?`<div class="group"><div class="group-h"><span class="gname u">${ic("radar")} Torre de controle</span><span class="gcount">${al.length}</span></div><div class="alerts">${al.map(alertCard).join("")}</div></div>`:""}
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

/* ===== Torre de controle ===== */
const TIPOS={verba:"Verba",cpl_meta:"CPL x meta",cpl_piorou:"CPL piorou",sem_lead:"Sem leads",conta_parada:"Conta parada",conv_zerada:"Conversões zeradas"};
const ago=iso=>{ if(!iso) return "—"; const m=Math.round((Date.now()-Date.parse(iso))/6e4); return m<1?"agora":m<60?`há ${m} min`:m<1440?`há ${Math.round(m/60)} h`:`há ${Math.round(m/1440)} d` };
function renderTorreBadge(){ const b=$("torreBadge"); if(!b) return; const k=S.alerts.filter(a=>a.ativo&&!a.visto_por&&a.nivel==="urgente").length; b.hidden=!k; b.textContent=k }
function alertCard(a){
  const cname=a.cliente?clientName(a.cliente):(a.conta||"Conta sem cliente");
  return `<div class="alert ${a.nivel} ${a.visto_por?"seen":""}">
    <div class="al-top"><span class="ct">${esc(cname)}</span><span class="al-tags"><span class="chip">${a.plataforma==="google"?"Google Ads":"Meta"}</span><span class="chip">${esc(TIPOS[a.tipo]||a.tipo)}</span></span></div>
    <div class="al-t">${esc(a.titulo)}</div>
    <div class="al-d">${esc(a.detalhe||"")}</div>
    <div class="al-foot"><span class="muted">${a.conta&&a.cliente?esc(a.conta)+" · ":""}desde ${ago(a.criado_em)}${a.visto_por?` · visto por ${esc(a.visto_por)}`:""}</span><span class="sp"></span>
      <button class="btn" type="button" data-altask="${esc(a.id)}">Criar tarefa</button>
      ${a.visto_por?`<button class="btn ghost" type="button" data-alseen="${esc(a.id)}" data-v="0">Desfazer</button>`:`<button class="btn ghost" type="button" data-alseen="${esc(a.id)}" data-v="1">Marcar como visto</button>`}</div></div>`;
}
function viewTorre(){
  const act=S.alerts.filter(a=>a.ativo), vis=act.filter(a=>S.showSeen||!a.visto_por);
  const urg=vis.filter(a=>a.nivel==="urgente"), att=vis.filter(a=>a.nivel!=="urgente");
  const st=S.torre, seen=act.filter(a=>a.visto_por).length;
  const group=(title,list,cls)=>list.length?`<div class="group"><div class="group-h"><span class="gname ${cls}">${title}</span><span class="gcount">${list.length}</span></div><div class="alerts">${list.map(alertCard).join("")}</div></div>`:"";
  return `<div class="page-head"><div><span class="label">Campanhas · Meta e Google Ads</span><h2 class="sec-title" style="font-size:32px">Torre de controle<span class="grad">.</span></h2>
      <p class="muted" style="margin:4px 0 0">Verificado ${st?.ultima_execucao?ago(st.ultima_execucao):"ainda não"}${st?.contas?` · ${st.contas} contas`:""} · atualiza sozinha de hora em hora</p>
      ${st?.erro?`<p class="err" style="margin-top:6px">Última verificação teve problema: ${esc(st.erro)}</p>`:""}</div>
    <div class="nums torre-nums"><div class="${urg.length?"bad":""}"><b>${act.filter(a=>a.nivel==="urgente"&&!a.visto_por).length}</b><small>urgentes</small></div><div class="warn"><b>${act.filter(a=>a.nivel!=="urgente"&&!a.visto_por).length}</b><small>atenção</small></div><div><b>${seen}</b><small>vistos</small></div></div></div>
    <label class="step-check" style="margin-bottom:14px"><input type="checkbox" id="showSeen" ${S.showSeen?"checked":""}>Mostrar alertas já vistos</label>
    ${group("Urgente",urg,"u")}${group("Atenção",att,"w")}
    ${vis.length?"":`<div class="card torre-ok"><b>Nenhum alerta${S.showSeen?"":" novo"}.</b><span class="muted">${st?.ultima_execucao?"As contas estão dentro do esperado.":"A primeira verificação ainda não rodou."}</span></div>`}`;
}

/* ===== Eventos da área principal ===== */
function bindView(){
  const q=$("q"); if(q) q.oninput=e=>{ S.q=e.target.value; const pos=e.target.selectionStart; render(); const n=$("q"); n.focus(); try{n.setSelectionRange(pos,pos)}catch(_){} };
  const fc=$("fClient"); if(fc) fc.onchange=e=>{ S.fClient=e.target.value; render() };
  const fw=$("fWho"); if(fw) fw.onchange=e=>{ S.fWho=e.target.value; render() };
  const cl=$("clear"); if(cl) cl.onclick=()=>{ S.fClient=""; S.fWho=""; S.q=""; render() };
  const nc=$("newClient"); if(nc) nc.onclick=()=>{ $("cNome").value=""; $("dClient").showModal() };
  const nt=$("newTpl"); if(nt) nt.onclick=()=>openTpl(null);
  const cq=$("cq"); if(cq) cq.oninput=e=>{ S.cq=e.target.value; const pos=e.target.selectionStart; render(); const n=$("cq"); n.focus(); try{n.setSelectionRange(pos,pos)}catch(_){} };
  const ss=$("showSeen"); if(ss) ss.onchange=e=>{ S.showSeen=e.target.checked; render() };
}
document.addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){ e.target.closest("dialog").close(); return }
  if(e.target.closest("[data-stop]")) return;
  const add=e.target.closest("[data-add]"); if(add){ openTask(null, JSON.parse(add.dataset.add)); return }
  const tp=e.target.closest("[data-tpl]"); if(tp){ openTpl(S.templates.find(x=>x.id===tp.dataset.tpl)); return }
  const at=e.target.closest("[data-altask]"); if(at){ const a=S.alerts.find(x=>x.id===at.dataset.altask);
    openTask(null,{cliente:a.cliente||"",titulo:a.titulo,notas:`Alerta da Torre de controle (${a.conta||""}):\n${a.detalhe||""}`,responsavel:"Pedro"}); return }
  const al=e.target.closest("[data-alseen]"); if(al){ markAlert(al.dataset.alseen, al.dataset.v==="1"); return }
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
  const [c,t,m,al,ts]=await Promise.all([
    S.sb.from("clients").select("id,name"),
    S.sb.from("tasks").select("*"),
    S.sb.from("templates").select("*").order("nome"),
    S.sb.from("alertas").select("*").eq("ativo",true),
    S.sb.from("torre_status").select("*").eq("id",1)]);
  S.alerts=al&&!al.error?al.data:[]; S.torre=ts&&!ts.error?ts.data?.[0]:null;
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
    .on("postgres_changes",{event:"*",schema:"public",table:"templates"},reloadSoon)
    .on("postgres_changes",{event:"*",schema:"public",table:"alertas"},reloadSoon).subscribe();
}
async function markAlert(id,on){
  const a=S.alerts.find(x=>x.id===id); if(!a) return;
  a.visto_por=on?(S.me||S.email):null; a.visto_em=on?new Date().toISOString():null; render();
  await S.sb.from("alertas").update({visto_por:a.visto_por,visto_em:a.visto_em}).eq("id",id);
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
  $("tTitulo").value=t?.titulo||preset.titulo||"";
  $("tCliente").innerHTML=clientOptions(t?.cliente??preset.cliente??(S.fClient||""),false);
  $("tResp").innerHTML=teamOptions(t?.responsavel??preset.responsavel??"");
  $("tPrazo").value=t?.prazo||"";
  $("tStatus").innerHTML=COLS.map(([k,l])=>`<option value="${k}" ${k===(t?.status||preset.status||"fazer")?"selected":""}>${l}</option>`).join("");
  $("tNotas").value=t?.notas||preset.notas||"";
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


/* ===== Fundo animado do login: pulsos pela grade, quadradinhos acendendo, brilho no mouse ===== */
const BG=(function(){
  const cv=$("bgfx"); if(!cv||!cv.getContext) return {start(){},stop(){}};
  const ctx=cv.getContext("2d"), G=44, reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w=0,h=0,dpr=1,raf=0,running=false,pulses=[],cells=[],mx=-999,my=-999,tx=-999,ty=-999,last=0;
  const light=()=>document.documentElement.dataset.mode==="light";
  function size(){ dpr=Math.min(devicePixelRatio||1,2); w=innerWidth; h=innerHeight; cv.width=w*dpr; cv.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0) }
  function newPulse(){
    const horiz=Math.random()<.5, dir=Math.random()<.5?1:-1, speed=120+Math.random()*220;
    const line=horiz?Math.floor(Math.random()*(h/G+1))*G:Math.floor(Math.random()*(w/G+1))*G;
    const len=(horiz?w:h)+400, start=dir>0?-200:len-200;
    return {horiz,dir,speed,line,pos:start,len,tail:90+Math.random()*160,hue:Math.random()<.8?"251,37,118":"255,141,185"};
  }
  function newCell(){ return {x:Math.floor(Math.random()*(w/G))*G, y:Math.floor(Math.random()*(h/G))*G, t:0, life:1.6+Math.random()*2.4, big:Math.random()<.15} }
  function frame(now){
    if(!running) return;
    const dt=Math.min(.05,(now-(last||now))/1000); last=now;
    ctx.clearRect(0,0,w,h);
    const L=light(), base=L?"20,18,20":"255,255,255";
    // brilho que segue o mouse (suave)
    tx+=(mx-tx)*.08; ty+=(my-ty)*.08;
    if(tx>-500){ const g=ctx.createRadialGradient(tx,ty,0,tx,ty,320); g.addColorStop(0,`rgba(251,37,118,${L?.10:.16})`); g.addColorStop(1,"rgba(251,37,118,0)"); ctx.fillStyle=g; ctx.fillRect(tx-320,ty-320,640,640) }
    // quadradinhos acendendo
    while(cells.length<Math.round(w*h/26000)) cells.push(newCell());
    cells=cells.filter(c=>{ c.t+=dt; const p=c.t/c.life; if(p>=1) return false;
      const a=Math.sin(p*Math.PI)*(c.big?.55:.35);
      ctx.fillStyle=c.big?`rgba(251,37,118,${a})`:`rgba(${base},${a*(L?.35:.22)})`;
      const s=c.big?G-2:7; ctx.fillRect(c.x+(G-s)/2,c.y+(G-s)/2,s,s); return true });
    // pulsos correndo pelas linhas da grade
    while(pulses.length<Math.max(6,Math.round((w+h)/260))) pulses.push(newPulse());
    pulses=pulses.filter(p=>{ p.pos+=p.speed*p.dir*dt;
      const head=p.pos, tail=p.pos-p.tail*p.dir;
      const [x1,y1,x2,y2]=p.horiz?[tail,p.line,head,p.line]:[p.line,tail,p.line,head];
      const g=ctx.createLinearGradient(x1,y1,x2,y2); g.addColorStop(0,`rgba(${p.hue},0)`); g.addColorStop(1,`rgba(${p.hue},${L?.7:.9})`);
      ctx.strokeStyle=g; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.fillStyle=`rgba(${p.hue},1)`; ctx.fillRect((p.horiz?head:p.line)-2,(p.horiz?p.line:head)-2,4,4);
      return p.dir>0?tail<p.len:tail>-200 });
    raf=requestAnimationFrame(frame);
  }
  const move=e=>{ mx=e.clientX; my=e.clientY; if(tx<-500){ tx=mx; ty=my } };
  return {
    start(){ if(reduce||running) return; running=true; size(); document.body.classList.add("on-login");
      addEventListener("resize",size); addEventListener("pointermove",move); last=0; raf=requestAnimationFrame(frame) },
    stop(){ running=false; cancelAnimationFrame(raf); document.body.classList.remove("on-login");
      removeEventListener("resize",size); removeEventListener("pointermove",move); ctx.clearRect(0,0,w,h) }
  };
})();
document.addEventListener("visibilitychange",()=>{ if(!$("login").hidden){ document.hidden?BG.stop():BG.start() } });

function start(session){
  BG.stop(); $("login").hidden=true; $("app").hidden=false;
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
  if(data.session){ started=true; start(data.session) } else { $("login").hidden=false; BG.start() }
  S.sb.auth.onAuthStateChange((_ev,session)=>{ if(session&&!started){ started=true; start(session) } });
})();
