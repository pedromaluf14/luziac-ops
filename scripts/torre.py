"""Torre de controle da LUZIAC: lê as contas de anúncio no Windsor.ai, aplica as regras de
alerta e grava o resultado na tabela `alertas` do Supabase.

Roda no GitHub Actions de hora em hora (.github/workflows/torre.yml).
Secrets: WINDSOR_API_KEY e SUPABASE_SERVICE_KEY (nunca no código).

Regras (mesmos critérios dos painéis: lead = "Leads (formulário)" do Meta, semana = 7 dias
completos até ontem, comparada com os 7 anteriores):
  verba        Meta: dias de fôlego = (limite − gasto) ÷ gasto médio dos últimos 7 dias.
               < 5 dias = atenção, < 2 = urgente. Conta sem limite de gastos não entra.
  cpl_meta     CPL dos últimos 7 dias acima da meta do cliente (CPL_META). Acima de 30% da meta = urgente.
  cpl_piorou   CPL subiu 30% ou mais contra a semana anterior, com 10+ leads nas duas semanas.
  sem_lead     Conjunto que costuma gerar lead gastou R$ 60+ nos últimos 2 dias sem nenhum lead.
  conta_parada Conta que gastava (R$ 15+/dia na semana) e não gastou nada ontem.
  conv_zerada  Google Ads: campanha gastou R$ 30+ nos últimos 2 dias com 0 conversões,
               depois de ter 3+ conversões nos 7 dias anteriores. Urgente.
"""
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

SUPABASE_URL = "https://cmklajrclmexucvshxpw.supabase.co"
LEAD_FIELD = "actions_onsite_conversion_lead_grouped"
TZ = timezone(timedelta(hours=-3))  # America/Sao_Paulo

# ---------- Ajustes ----------
VERBA_ATENCAO_DIAS = 5
VERBA_URGENTE_DIAS = 2
CPL_PIOROU = 0.30          # +30%
CPL_MIN_LEADS = 10         # nas duas semanas comparadas
CPL_META = {"lopes-abc": 20.0}   # meta de CPL por cliente (R$). Sem meta: só "CPL piorou".
SEM_LEAD_GASTO = 60.0      # R$ nos últimos 2 dias
SEM_LEAD_HISTORICO = 3     # leads no conjunto nos 13 dias anteriores (para saber que é conjunto de lead)
PARADA_MEDIA_DIA = 15.0    # R$/dia na semana anterior
GOOGLE_GASTO = 30.0
GOOGLE_CONV_ANTES = 3

# Conta de anúncio -> cliente (id do cliente no sistema). Contas fora desta lista são
# reconhecidas pelo nome (NAME_HINTS); se nada bater, o alerta aparece com o nome da conta.
ACCOUNT_CLIENT = {
    "648023391646107": "abpi",
    "5349039235117630": "rede-lopes",
    "129584587555584": "dialogo-engenharia",
    "832501825187291": "acqua-ibiuna",
    "854204220059560": "lopes-abc",
    "1995957644254642": "lopes-lil",
    "506-775-7909": "acqua-ibiuna",
    "5067757909": "acqua-ibiuna",
}
NAME_HINTS = [
    ("acqua", "acqua-ibiuna"), ("nova caucaia", "nova-caucaia"), ("caucaia", "nova-caucaia"),
    ("sancan", "sancan"), ("lotus", "lotus"), ("abpi", "abpi"), ("altma", "altma"), ("hive", "altma"),
    ("azevedo", "azevedo"), ("bartozzi", "bartozzi"), ("engefel", "engefel"), ("f&d", "fd"),
    ("ico", "ico"), ("schmid", "schmid"), ("villasul", "villasul"), ("dialogo", "dialogo-engenharia"),
    ("lopes abc", "lopes-abc"), ("lopes - abc", "lopes-abc"), ("lil", "lopes-lil"),
    ("rede lopes", "rede-lopes"), ("luziac", "luziac-hub"),
]


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


def client_for(account_id, account_name):
    aid = str(account_id or "").strip()
    if aid in ACCOUNT_CLIENT:
        return ACCOUNT_CLIENT[aid]
    if aid.replace("-", "") in ACCOUNT_CLIENT:
        return ACCOUNT_CLIENT[aid.replace("-", "")]
    name = norm(account_name)
    for hint, cid in NAME_HINTS:
        if hint in name:
            return cid
    return None


def n(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def brl(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v):
    return f"{v * 100:+.0f}%".replace("+", "+")


# ---------- Windsor ----------
def windsor(api_key, connector, fields, date_from, date_to):
    params = urllib.parse.urlencode({"api_key": api_key, "date_from": date_from, "date_to": date_to,
                                     "fields": ",".join(fields)})
    url = f"https://connectors.windsor.ai/{connector}?{params}"
    try:
        with urllib.request.urlopen(url, timeout=300) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Windsor {connector} HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}")
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError(f"Windsor {connector}: resposta inesperada {str(payload)[:300]}")
    return rows


# ---------- Supabase ----------
def sb(key, method, path, body=None, prefer=None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"):  # chave antiga (JWT) também precisa do Authorization
        headers["Authorization"] = f"Bearer {key}"
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Supabase {method} {path} HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}")


# ---------- Regras ----------
def meta_alerts(rows, accounts, d):
    """rows: diário por conjunto; accounts: dados de limite/gasto por conta."""
    out = []
    y1, y2 = d(1), d(2)
    last7 = {d(i) for i in range(1, 8)}
    prev7 = {d(i) for i in range(8, 15)}
    acc = defaultdict(lambda: {"name": "", "s7": 0, "l7": 0, "sp": 0, "lp": 0, "y1": 0, "days_prev": set()})
    adset = defaultdict(lambda: {"s2": 0, "l2": 0, "lhist": 0, "campaign": ""})
    for r in rows:
        aid = str(r.get("account_id") or r.get("account_name") or "")
        if not aid:
            continue
        day, s, l = r.get("date"), n(r.get("spend")), n(r.get(LEAD_FIELD))
        a = acc[aid]
        a["name"] = r.get("account_name") or a["name"]
        if day in last7:
            a["s7"] += s; a["l7"] += l
        if day in prev7:
            a["sp"] += s; a["lp"] += l
        if day == y1:
            a["y1"] += s
        if day in {d(i) for i in range(2, 9)} and s > 0:
            a["days_prev"].add(day)
        key = (aid, r.get("adset_name") or r.get("campaign") or "")
        ad = adset[key]
        ad["campaign"] = r.get("campaign") or ad["campaign"]
        if day in (y1, y2):
            ad["s2"] += s; ad["l2"] += l
        else:
            ad["lhist"] += l

    for aid, a in acc.items():
        cid = client_for(aid, a["name"])
        base = {"cliente": cid, "conta": a["name"], "plataforma": "meta"}
        # CPL
        cpl7 = a["s7"] / a["l7"] if a["l7"] else None
        cplp = a["sp"] / a["lp"] if a["lp"] else None
        meta = CPL_META.get(cid)
        if meta and cpl7 and cpl7 > meta:
            out.append({**base, "id": f"cpl_meta:{aid}", "tipo": "cpl_meta",
                        "nivel": "urgente" if cpl7 > meta * 1.3 else "atencao",
                        "titulo": f"CPL acima da meta: {brl(cpl7)}",
                        "detalhe": f"Meta de {brl(meta)}. Últimos 7 dias: {int(a['l7'])} leads com {brl(a['s7'])} investidos.",
                        "numeros": {"cpl": round(cpl7, 2), "meta": meta, "leads": a["l7"], "gasto": round(a["s7"], 2)}})
        if cpl7 and cplp and a["l7"] >= CPL_MIN_LEADS and a["lp"] >= CPL_MIN_LEADS and cpl7 >= cplp * (1 + CPL_PIOROU):
            var = cpl7 / cplp - 1
            out.append({**base, "id": f"cpl_piorou:{aid}", "tipo": "cpl_piorou",
                        "nivel": "urgente" if var >= 0.6 else "atencao",
                        "titulo": f"CPL subiu {pct(var)} na semana",
                        "detalhe": f"De {brl(cplp)} para {brl(cpl7)} (últimos 7 dias contra os 7 anteriores). Leads: {int(a['lp'])} → {int(a['l7'])}.",
                        "numeros": {"cpl": round(cpl7, 2), "cpl_antes": round(cplp, 2), "leads": a["l7"], "leads_antes": a["lp"]}})
        # Conta parada
        if a["y1"] == 0 and a["sp"] + a["s7"] > 0:
            prev_spend = sum(n(r.get("spend")) for r in rows if str(r.get("account_id") or r.get("account_name")) == aid and r.get("date") in {d(i) for i in range(2, 9)})
            if prev_spend / 7 >= PARADA_MEDIA_DIA and len(a["days_prev"]) >= 5:
                out.append({**base, "id": f"conta_parada:{aid}", "tipo": "conta_parada", "nivel": "urgente",
                            "titulo": "Conta não gastou nada ontem",
                            "detalhe": f"Vinha gastando cerca de {brl(prev_spend / 7)} por dia. Verifique pagamento, reprovação ou campanhas pausadas.",
                            "numeros": {"media_dia": round(prev_spend / 7, 2)}})
        # Verba
        info = accounts.get(aid)
        if info and info["cap"] > 0 and a["s7"] > 0:
            saldo = info["cap"] - info["spent"]
            ritmo = a["s7"] / 7
            dias = saldo / ritmo if ritmo else 999
            if dias < VERBA_ATENCAO_DIAS:
                fundos = saldo + info["balance"]
                out.append({**base, "id": f"verba:{aid}", "tipo": "verba",
                            "nivel": "urgente" if dias < VERBA_URGENTE_DIAS else "atencao",
                            "titulo": f"Verba acaba em {max(dias, 0):.1f} dias".replace(".", ","),
                            "detalhe": f"Saldo de {brl(max(saldo, 0))} no limite de gastos, no ritmo de {brl(ritmo)}/dia. Fundos disponíveis no Gerenciador: {brl(fundos)}.",
                            "numeros": {"dias": round(dias, 1), "saldo": round(saldo, 2), "ritmo": round(ritmo, 2)}})

    for (aid, name), ad in adset.items():
        if ad["s2"] >= SEM_LEAD_GASTO and ad["l2"] == 0 and ad["lhist"] >= SEM_LEAD_HISTORICO:
            a = acc[aid]
            out.append({"cliente": client_for(aid, a["name"]), "conta": a["name"], "plataforma": "meta",
                        "id": f"sem_lead:{aid}:{norm(name)[:80]}", "tipo": "sem_lead", "nivel": "atencao",
                        "titulo": f"{name or 'Conjunto'} sem leads há 2 dias",
                        "detalhe": f"Gastou {brl(ad['s2'])} ontem e anteontem sem nenhum lead, mas vinha gerando ({int(ad['lhist'])} leads nos 13 dias antes).",
                        "numeros": {"gasto_2d": round(ad["s2"], 2), "leads_antes": ad["lhist"]}})
    return out


def google_alerts(rows, d):
    out = []
    y = {d(1), d(2)}
    before = {d(i) for i in range(3, 10)}
    camp = defaultdict(lambda: {"s2": 0, "c2": 0, "cb": 0, "name": ""})
    for r in rows:
        aid = str(r.get("account_id") or r.get("account_name") or "")
        key = (aid, r.get("campaign") or "")
        c = camp[key]
        c["name"] = r.get("account_name") or c["name"]
        if r.get("date") in y:
            c["s2"] += n(r.get("spend")); c["c2"] += n(r.get("conversions"))
        elif r.get("date") in before:
            c["cb"] += n(r.get("conversions"))
    for (aid, cname), c in camp.items():
        if c["s2"] >= GOOGLE_GASTO and c["c2"] == 0 and c["cb"] >= GOOGLE_CONV_ANTES:
            out.append({"cliente": client_for(aid, c["name"]), "conta": c["name"], "plataforma": "google",
                        "id": f"conv_zerada:{aid}:{norm(cname)[:80]}", "tipo": "conv_zerada", "nivel": "urgente",
                        "titulo": f"Google Ads sem conversões: {cname}",
                        "detalhe": f"Gastou {brl(c['s2'])} ontem e anteontem com 0 conversões, depois de {int(c['cb'])} conversões nos 7 dias anteriores. Pode ser tag/ação de conversão quebrada.",
                        "numeros": {"gasto_2d": round(c["s2"], 2), "conv_antes": c["cb"]}})
    return out


def main():
    wkey, skey = os.environ.get("WINDSOR_API_KEY"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not wkey or not skey:
        print("ERRO: faltam os secrets WINDSOR_API_KEY e/ou SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(1)
    today = datetime.now(TZ).date()
    d = lambda i: (today - timedelta(days=i)).isoformat()

    alerts, ok_platforms, errors, n_accounts = [], set(), [], 0
    try:
        rows = windsor(wkey, "facebook", ["date", "account_id", "account_name", "campaign", "adset_name", "spend", LEAD_FIELD], d(14), d(1))
        acc_rows = windsor(wkey, "facebook", ["account_id", "account_name", "spend_cap", "amount_spent", "account_balance"], d(0), d(0))
        accounts = {str(r.get("account_id") or r.get("account_name")): {"cap": n(r.get("spend_cap")) / 100, "spent": n(r.get("amount_spent")) / 100, "balance": n(r.get("account_balance")) / 100} for r in acc_rows}
        if rows:
            alerts += meta_alerts(rows, accounts, d)
            ok_platforms.add("meta")
            n_accounts += len({str(r.get("account_id") or r.get("account_name")) for r in rows})
        print(f"Meta: {len(rows)} linhas, {len(accounts)} contas com limite")
    except Exception as e:
        errors.append(str(e)); print("ERRO Meta:", e, file=sys.stderr)
    try:
        g = windsor(wkey, "google_ads", ["date", "account_id", "account_name", "campaign", "spend", "conversions"], d(9), d(1))
        if g:
            alerts += google_alerts(g, d)
            ok_platforms.add("google")
            n_accounts += len({str(r.get("account_id") or r.get("account_name")) for r in g})
        print(f"Google: {len(g)} linhas")
    except Exception as e:
        errors.append(str(e)); print("ERRO Google:", e, file=sys.stderr)

    now = datetime.now(timezone.utc).isoformat()
    existing = {a["id"]: a for a in (sb(skey, "GET", "alertas?select=id,ativo,plataforma") or [])}
    fresh, cont = [], []
    for a in alerts:
        row = {"id": a["id"], "cliente": a["cliente"], "conta": a["conta"], "plataforma": a["plataforma"], "tipo": a["tipo"],
               "nivel": a["nivel"], "titulo": a["titulo"], "detalhe": a["detalhe"], "numeros": a["numeros"],
               "ativo": True, "atualizado_em": now, "resolvido_em": None}
        if a["id"] in existing and existing[a["id"]]["ativo"]:
            cont.append(row)
        else:  # novo ou voltou: aparece de novo para todos
            fresh.append({**row, "criado_em": now, "visto_por": None, "visto_em": None})
    for batch in (fresh, cont):
        if batch:
            sb(skey, "POST", "alertas?on_conflict=id", batch, "resolution=merge-duplicates,return=minimal")
    # o que deixou de acontecer é resolvido (só nas plataformas que responderam, para não sumir por falha)
    current = {a["id"] for a in alerts}
    gone = [i for i, a in existing.items() if a["ativo"] and i not in current and a.get("plataforma") in ok_platforms]
    for i in range(0, len(gone), 50):
        ids = ",".join(f'"{x}"' for x in gone[i:i + 50])
        sb(skey, "PATCH", f"alertas?id=in.({urllib.parse.quote(ids)})", {"ativo": False, "resolvido_em": now}, "return=minimal")
    sb(skey, "PATCH", "torre_status?id=eq.1", {"ultima_execucao": now, "contas": n_accounts, "erro": "; ".join(errors)[:500] or None}, "return=minimal")
    print(f"{len(alerts)} alertas ativos ({len(fresh)} novos), {len(gone)} resolvidos")
    if not ok_platforms:
        sys.exit(1)


if __name__ == "__main__":
    main()
