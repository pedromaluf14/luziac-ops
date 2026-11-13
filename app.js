/* LUZIAC Ops — quadro de tarefas da equipe (GitHub Pages + Supabase) */

/* ===== Configuração da equipe e do fluxo ===== */
const COLS = [["fazer","A fazer"],["producao","Em produção"],["revisao","Em revisão"],["aguardando","Aguardando cliente"],["aprovado","Aprovado / publicar"],["feito","Entregue"]];
const ACTIVE = new Set(["producao","revisao"]);
const TEAM = [
  {n:"Carol",    role:"Coordenadora de Operações", area:"operacoes"},
  {n:"João",     role:"Filmmaker",                 area:"video"},
  {n:"Jéssica",  role:"Designer",                  area:"design"},
  {n:"Franklin", role:"Desenvolvedor",             area:"dev"},
  {n:"Pedro",    role:"CS e Gestor de Tráfego",    area:"trafego"},
  {n:"Guilherme",role:"Comercial",                 area:"comercial"},
  {n:"Luiza",    role:"Redatora e Social Media",   area:"conteudo"}];
const AREAS = {operacoes:"Operações",video:"Vídeo",design:"Design",dev:"Desenvolvimento",trafego:"Tráfego",cs:"Atendimento / CS",comercial:"Comercial",conteudo:"Conteúdo / Social"};
const WIP = 6; // limite de tarefas em andamento por pessoa
const PRI = {alta:"Alta",media:"Média",baixa:"Baixa"};
const PRI_ORDER = {alta:0,media:1,baixa:2};

/* ===== Estado e utilitários ===== */
const S = {sb:null,clients:[],tasks:[],fClient:"",fWho:"",fArea:"",q:"",view:"board",readOnly:false,editTask:null};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const todayISO = () => {const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const clientById = id => S.clients.find(c => c.id === id);
const initials = n => (n||"?").normalize("NFD").replace(/[̀-ͯ]/g,"").slice(0,2).toUpperCase();
const person = n => TEAM.find(p => p.n === n);
const isLate = t => t.status !== "feito" && t.prazo && t.prazo < todayISO();
try { const v = localStorage.getItem("ops-view"); if (v === "people" || v === "board") S.view = v } catch(_) {}

/* linhas do banco (snake_case) -> objetos da tela */
const fromRow = r => ({id:r.id,titulo:r.titulo,responsavel:r.responsavel,area:r.area,cliente:r.cliente||"",status:r.status||"fazer",
  prioridade:r.prioridade||"media",prazo:r.prazo||"",notas:r.notas||"",criadoEm:r.criado_em,concluidoEm:r.concluido_em||""});
const toRow = t => ({titulo:t.titulo,responsavel:t.responsavel,area:t.area,cliente:t.cliente||null,status:t.status,
  prioridade:t.prioridade,prazo:t.prazo||null,notas:t.notas||null,concluido_em:t.concluidoEm||null});

/* ===== Render ===== */
function fillSelects(){
  const opts=[...S.clients].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("fClient").innerHTML='<option value="">Todos os clientes</option><option value="_interno">Interno LUZIAC</option>'+opts; $("fClient").value=S.fClient;
  $("tCliente").innerHTML='<option value="">Interno LUZIAC</option>'+opts;
  const area=Object.entries(AREAS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
  $("fArea").innerHTML='<option value="">Todas as áreas</option>'+area; $("fArea").value=S.fArea;
  $("tArea").innerHTML=area;
  const who=TEAM.map(p=>`<option>${p.n}</option>`).join("");
  $("fWho").innerHTML='<option value="">Toda a equipe</option>'+who; $("fWho").value=S.fWho;
  $("tResp").innerHTML=who;
  $("tStatus").innerHTML=COLS.map(([k,l])=>`<option value="${k}">${l}</option>`).join("");
}
function renderTotals(){
  const open=S.tasks.filter(t=>t.status!=="feito"), wk=Date.now()-7*864e5;
  const done7=S.tasks.filter(t=>t.status==="feito"&&t.concluidoEm&&Date.parse(t.concluidoEm)>=wk).length;
  const late=open.filter(isLate).length;
  $("totals").innerHTML=`<span><b>${open.length}</b>em aberto</span><span class="${late?"bad":""}"><b>${late}</b>atrasadas</span><span><b>${open.filter(t=>t.status==="revisao").length}</b>em revisão</span><span><b>${open.filter(t=>t.status==="aguardando").length}</b>aguardando cliente</span><span><b>${done7}</b>entregues em 7 dias</span>`;
}
function personStats(n){
  const mine=S.tasks.filter(t=>t.responsavel===n), open=mine.filter(t=>t.status!=="feito");
  const wk=Date.now()-7*864e5, mo=Date.now()-30*864e5;
  const done30=mine.filter(t=>t.status==="feito"&&t.concluidoEm&&Date.parse(t.concluidoEm)>=mo&&t.prazo);
  const ontime=done30.filter(t=>t.concluidoEm.slice(0,10)<=t.prazo).length;
  return {open:open.length,active:open.filter(t=>ACTIVE.has(t.status)).length,late:open.filter(isLate).length,
    done7:mine.filter(t=>t.status==="feito"&&t.concluidoEm&&Date.parse(t.concluidoEm)>=wk).length,
    ontimePct:done30.length?Math.round(ontime/done30.length*100):null,ontimeN:done30.length};
}
function personCard(p,asButton=true){
  const s=personStats(p.n),pct=Math.min(100,s.active/WIP*100),lvl=s.active>WIP?"bad":s.active>=WIP-1?"warn":"";
  const inner=`<span class="who"><span class="av">${initials(p.n)}</span><div><strong>${p.n}</strong><small>${p.role}</small></div></span>
    <span class="load ${lvl}" title="${s.active} de ${WIP} em andamento"><i style="width:${Math.max(pct,s.active?6:0)}%"></i></span>
    <span class="stats"><span><b>${s.open}</b>abertas</span><span><b>${s.active}</b>fazendo</span><span class="${s.late?"late":""}"><b>${s.late}</b>atrasadas</span><span><b>${s.done7}</b>entregues</span></span>
    <span class="ontime">No prazo (30 dias): <b>${s.ontimePct==null?"—":s.ontimePct+"%"}</b>${s.ontimeN?` de ${s.ontimeN}`:""}</span>`;
  return asButton?`<button type="button" class="tm ${S.fWho===p.n?"sel":""}" data-who="${esc(p.n)}">${inner}</button>`:`<div class="tm" style="cursor:default">${inner}</div>`;
}
const renderTeam=()=>{$("team").innerHTML=TEAM.map(p=>personCard(p)).join("")};
function visibleTasks(){
  const q=S.q.trim().toLowerCase();
  return S.tasks.filter(t=>(!S.fClient||(S.fClient==="_interno"?!t.cliente:t.cliente===S.fClient))&&(!S.fWho||t.responsavel===S.fWho)&&(!S.fArea||t.area===S.fArea)&&
    (!q||(t.titulo||"").toLowerCase().includes(q)||(t.notas||"").toLowerCase().includes(q)||(clientById(t.cliente)?.name||"").toLowerCase().includes(q)));
}
const sortOpen=(a,b)=>(PRI_ORDER[a.prioridade]??1)-(PRI_ORDER[b.prioridade]??1)||(a.prazo||"9999").localeCompare(b.prazo||"9999");
function cardHTML(t,showStage=false){
  const c=clientById(t.cliente),t0=todayISO();let due="";
  if(t.prazo){const [,m,d]=t.prazo.split("-");const cls=isLate(t)?"late":t.status!=="feito"&&t.prazo===t0?"today":"";due=`<span class="due ${cls}">${cls==="late"?"atrasada · ":cls==="today"?"hoje · ":""}${d}/${m}</span>`}
  const stage=showStage?`<span>${COLS.find(([k])=>k===t.status)?.[1]||""}</span>`:"";
  return `<div class="card" draggable="${!S.readOnly&&!showStage}" data-task="${esc(t.id)}" tabindex="0" role="button" aria-label="Abrir tarefa ${esc(t.titulo)}">
    <span class="top"><span class="cl">${c?esc(c.name):"Interno LUZIAC"}</span><span class="ar">${esc(AREAS[t.area]||"")}</span></span>
    <span class="t">${esc(t.titulo)}</span>
    <span class="meta"><span class="pill ${t.prioridade||"media"}">${PRI[t.prioridade]||"Média"}</span>${stage}${due}<span class="av" title="${esc(t.responsavel)}">${initials(t.responsavel)}</span></span></div>`;
}
function renderBoard(){
  const vis=visibleTasks();
  return `<div class="board-scroll"><div class="board">${COLS.map(([k,l])=>{
    let items=vis.filter(t=>t.status===k),total=items.length;
    if(k==="feito")items=items.sort((a,b)=>(b.concluidoEm||"").localeCompare(a.concluidoEm||"")).slice(0,30); else items.sort(sortOpen);
    return `<div class="col" data-col="${k}"><div class="col-h"><span>${l}</span><i>${total}</i></div>
      ${items.map(t=>cardHTML(t)).join("")||'<div class="empty">Nada aqui.</div>'}
      ${S.readOnly||k==="feito"?"":`<button type="button" class="add" data-addto="${k}">+ adicionar</button>`}</div>`;
  }).join("")}</div></div>`;
}
function renderPeople(){
  const vis=visibleTasks().filter(t=>t.status!=="feito"), people=S.fWho?TEAM.filter(p=>p.n===S.fWho):TEAM;
  return `<div class="lanes">${people.map(p=>{
    const items=vis.filter(t=>t.responsavel===p.n).sort((a,b)=>Number(isLate(b))-Number(isLate(a))||sortOpen(a,b));
    return `<div class="lane">${personCard(p,false)}<div class="lane-items">${items.map(t=>cardHTML(t,true)).join("")||'<div class="empty">Sem tarefas abertas.</div>'}${S.readOnly?"":`<button type="button" class="add" data-addfor="${esc(p.n)}">+ tarefa para ${esc(p.n)}</button>`}</div></div>`;
  }).join("")}</div>`;
}
function renderView(){
  $("view").innerHTML=S.view==="people"?renderPeople():renderBoard();
  document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===S.view)));
  $("clear").hidden=!(S.fClient||S.fWho||S.fArea||S.q);
}
function renderAll(){fillSelects();renderTotals();renderTeam();renderView()}

/* ===== Dados (Supabase) ===== */
async function loadAll(){
  const [c,t]=await Promise.all([S.sb.from("clients").select("id,name").order("name"),S.sb.from("tasks").select("*")]);
  if(c.error||t.error){$("sync").textContent="Sem conexão com os dados";return}
  S.clients=c.data; S.tasks=t.data.map(fromRow);
  $("sync").textContent="Sincronizado ao vivo"; renderAll();
}
let reloadTimer=null;
const scheduleReload=()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(loadAll,250)};
function subscribe(){
  S.sb.channel("ops").on("postgres_changes",{event:"*",schema:"public",table:"tasks"},scheduleReload)
    .on("postgres_changes",{event:"*",schema:"public",table:"clients"},scheduleReload).subscribe();
}
async function upsertTask(id,body){
  const row=toRow(body);
  const r=id?await S.sb.from("tasks").update(row).eq("id",id):await S.sb.from("tasks").insert(row);
  if(r.error)throw r.error; await loadAll();
}

/* ===== Modal de tarefa ===== */
function openTask(t,preset={}){
  S.editTask=t?t.id:null;
  $("dTaskTitle").textContent=t?"Editar tarefa":"Nova tarefa";
  const resp=t?.responsavel||preset.responsavel||S.fWho||"Carol";
  $("tTitulo").value=t?.titulo||""; $("tResp").value=resp;
  $("tArea").value=t?.area||S.fArea||person(resp)?.area||"operacoes";
  $("tCliente").value=t?.cliente??(S.fClient&&S.fClient!=="_interno"?S.fClient:"");
  $("tStatus").value=t?.status||preset.status||"fazer";
  $("tPrior").value=t?.prioridade||"media"; $("tPrazo").value=t?.prazo||""; $("tNotas").value=t?.notas||"";
  $("tDel").hidden=!t; $("tConfirm").hidden=true; $("tErr").hidden=true;
  $("dTask").showModal();
}
$("tResp").onchange=e=>{if(!S.editTask){const a=person(e.target.value)?.area;if(a)$("tArea").value=a}};
$("fTask").onsubmit=async e=>{
  e.preventDefault();
  const status=$("tStatus").value,prev=S.editTask?S.tasks.find(t=>t.id===S.editTask):null;
  const body={titulo:$("tTitulo").value.trim(),responsavel:$("tResp").value,area:$("tArea").value,cliente:$("tCliente").value,status,
    prioridade:$("tPrior").value,prazo:$("tPrazo").value,notas:$("tNotas").value.trim(),
    concluidoEm:status==="feito"?(prev?.status==="feito"&&prev.concluidoEm?prev.concluidoEm:new Date().toISOString()):""};
  if(!body.titulo)return;
  try{await upsertTask(prev?prev.id:null,body);$("dTask").close()}catch(err){showErr(err)}
};
function showErr(){const el=$("tErr");el.hidden=false;el.textContent="Não deu para salvar agora. Confira a conexão e tente de novo."}
async function moveTask(id,status){
  const t=S.tasks.find(x=>x.id===id); if(!t||t.status===status)return;
  t.status=status; t.concluidoEm=status==="feito"?new Date().toISOString():""; renderAll();
  const r=await S.sb.from("tasks").update({status,concluido_em:t.concluidoEm||null}).eq("id",id);
  if(r.error)loadAll();
}
$("tDel").onclick=()=>{$("tConfirm").hidden=false};
$("tDelNo").onclick=()=>{$("tConfirm").hidden=true};
$("tDelYes").onclick=async()=>{const r=await S.sb.from("tasks").delete().eq("id",S.editTask);if(r.error)return showErr();$("dTask").close();loadAll()};

/* ===== Eventos ===== */
document.addEventListener("click",e=>{
  const c=e.target.closest("[data-close]");if(c){c.closest("dialog").close();return}
  const v=e.target.closest("[data-view]");if(v){S.view=v.dataset.view;try{localStorage.setItem("ops-view",S.view)}catch(_){}renderView();return}
  const tm=e.target.closest("[data-who]");if(tm){S.fWho=S.fWho===tm.dataset.who?"":tm.dataset.who;renderAll();return}
  const add=e.target.closest("[data-addto]");if(add){openTask(null,{status:add.dataset.addto});return}
  const af=e.target.closest("[data-addfor]");if(af){openTask(null,{responsavel:af.dataset.addfor});return}
  const card=e.target.closest("[data-task]");if(card){openTask(S.tasks.find(t=>t.id===card.dataset.task));return}
});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const card=e.target.closest?.("[data-task]");if(card)openTask(S.tasks.find(t=>t.id===card.dataset.task))}});
$("newTask").onclick=()=>openTask(null);
$("fClient").onchange=e=>{S.fClient=e.target.value;renderView()};
$("fArea").onchange=e=>{S.fArea=e.target.value;renderView()};
$("fWho").onchange=e=>{S.fWho=e.target.value;renderAll()};
$("q").oninput=e=>{S.q=e.target.value;renderView()};
$("clear").onclick=()=>{S.fClient="";S.fWho="";S.fArea="";S.q="";$("q").value="";renderAll()};

let dragId=null;
document.addEventListener("dragstart",e=>{const c=e.target.closest?.("[data-task]");if(!c||c.getAttribute("draggable")!=="true")return;dragId=c.dataset.task;c.classList.add("dragging");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",dragId)}catch(_){}});
document.addEventListener("dragend",e=>{e.target.closest?.("[data-task]")?.classList.remove("dragging");document.querySelectorAll(".col.over").forEach(x=>x.classList.remove("over"));dragId=null});
document.addEventListener("dragover",e=>{const col=e.target.closest?.(".col");if(!col||!dragId)return;e.preventDefault();document.querySelectorAll(".col.over").forEach(x=>x!==col&&x.classList.remove("over"));col.classList.add("over")});
document.addEventListener("drop",e=>{const col=e.target.closest?.(".col");if(!col||!dragId)return;e.preventDefault();col.classList.remove("over");moveTask(dragId,col.dataset.col);dragId=null});

/* ===== Login ===== */
function showApp(session){
  $("login").hidden=!!session; $("app").hidden=!session;
  if(session){$("me").textContent=session.user.email;fillSelects();renderAll();loadAll();subscribe()}
}
$("fLogin").onsubmit=async e=>{
  e.preventDefault(); $("lErr").hidden=true; $("lBtn").disabled=true;
  const {error}=await S.sb.auth.signInWithPassword({email:$("lEmail").value.trim(),password:$("lPass").value});
  $("lBtn").disabled=false;
  if(error){$("lErr").hidden=false;$("lErr").textContent="E-mail ou senha incorretos."}
};
$("logout").onclick=async()=>{await S.sb.auth.signOut();location.reload()};

(async()=>{
  const cfg=window.OPS_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase){
    $("login").hidden=false;$("lErr").hidden=false;$("lErr").textContent="Sistema ainda não configurado (config.js).";return}
  S.sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const {data}=await S.sb.auth.getSession(); let shown=!!data.session; showApp(data.session);
  S.sb.auth.onAuthStateChange((_ev,session)=>{if(session&&!shown){shown=true;showApp(session)}});
})();
