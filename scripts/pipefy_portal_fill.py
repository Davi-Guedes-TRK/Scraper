"""
Preenche o formulário "SEC | Ônus" (Portal) do Pipefy usando a sessão salva (sem API).
Preenche TUDO menos os 2 campos NIDO (Código do Imóvel NIDO e Código da Proposta no NIDO).
NÃO envia por padrão — preenche e tira screenshot. Use --submit pra enviar de verdade.

Fontes de dados:
  • um JSON por imóvel:        python scripts/pipefy_portal_fill.py dados.json
  • do banco (relatório):      python scripts/pipefy_portal_fill.py --from-db [N]
        -> imóveis com numero_matricula preenchido (≠ 'N/A') em imoveis_todos
  • do gate de dedup (Fase 3): python scripts/pipefy_portal_fill.py --from-gate [N]
        -> onus_pipeline: dedup_nivel='nenhum' e onus_solicitada_em IS NULL
        -> com --submit, marca onus_solicitada_em=now() após enviar
Flags: --submit (envia), --headful (mostra o browser)

Fixos por padrão: Finalidade="Consulta de Dados ( Simples )", Empresa="TRK Administradora",
Solicitante/E-mail do Davi. Cartório default "Outro" (não há fonte no sistema).
"""
import json, re, sys, time, unicodedata
from pathlib import Path
from playwright.sync_api import sync_playwright

try: sys.stdout.reconfigure(encoding="utf-8")  # console Windows é cp1252
except Exception: pass

ROOT    = Path(__file__).parent.parent
SESSION = ROOT / "credentials" / "pipefy_session.json"
SHOTDIR = ROOT / "credentials"
URL = ("https://app.pipefy.com/organizations/300542579/interfaces/"
       "288f4973-b7d0-4194-b041-3ee9d19f2e12/pages/"
       "c0a4d373-51ab-4f7b-898e-6285f58b9ada"
       "?form=2a327809-be0b-42fd-ad5e-2762beae97b9&origin=public%20form")

DEFAULTS = {
    "solicitante": "Davi Guedes",
    "email":       "d.guedes@trkimoveis.com.br",
    "finalidade":  "Consulta de Dados ( Simples )",
    "empresa":     "TRK Administradora",
    "cartorio":    "Outro",   # fallback se a região não estiver na lista de ofícios
}

# Cartório por região (fonte: oficios.txt). Opções exatas do form: 1º/2º/3º/4º Ofício, Outro.
def _norm(s):
    t = unicodedata.normalize('NFKD', s or '')
    t = ''.join(c for c in t if not unicodedata.combining(c))   # tira acentos; º->o, ª->a
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()

OFICIO = {1: '1º Ofício', 2: '2º Ofício', 3: '3º Ofício', 4: '4º Ofício'}
REGIAO_OFICIO = {
    1: ['asa sul', 'lago sul', 'sudoeste', 'cruzeiro', 'octogonal', 'setor grafico sul'],
    2: ['asa norte', 'paranoa', 'jardim botanico', 'lago norte', 'sof norte'],
    3: ['taguatinga', 'aguas claras', 'samambaia', 'recanto'],
    4: ['guara', 'nucleo bandeirante', 'candangolandia', 'riacho fundo', 'setor de industria', 'smpw', 'park way', 'park sul'],
}
def cartorio_for(bairro):
    b = _norm(bairro)
    if not b: return 'Outro'
    for of, keys in REGIAO_OFICIO.items():
        for k in keys:
            kn = _norm(k)
            if kn and (kn in b or b in kn):
                return OFICIO[of]
    return 'Outro'

# A RA/bairro de verdade vem da coluna `cidade` (slug). "lago-sul" -> "Lago Sul".
# (A coluna `bairro` no banco guarda o endereço detalhado tipo "SHIS QI 11 Conjunto 10".)
def pretty_regiao(cidade):
    return re.sub(r'[-_]+', ' ', cidade).strip().title() if cidade else ""

JS_FIND = r"""
(label) => {
  const norm = s => (s||'').replace(/\s+/g,' ').replace(/^[*\s]+/,'').trim().toLowerCase();
  const want = label.toLowerCase();
  const nodes = [...document.querySelectorAll('label,legend,span,div,p')];
  const lab = nodes.find(e => norm(e.innerText).startsWith(want) && e.querySelectorAll('*').length < 25);
  if (!lab) return false;
  let c = lab;
  for (let i=0; i<7 && c; i++) {
    const ctrl = c.querySelector("input,textarea,[role=combobox],[role=button],[contenteditable=true]");
    if (ctrl) { document.querySelectorAll('[data-fill]').forEach(x=>x.removeAttribute('data-fill'));
                ctrl.setAttribute('data-fill','1'); return true; }
    c = c.parentElement;
  }
  return false;
}"""

def _clear(page): page.evaluate("document.querySelectorAll('[data-fill]').forEach(x=>x.removeAttribute('data-fill'))")

def fill_text(page, label, value, log):
    if not value: log.append(f"  · {label}: (vazio, pulado)"); return
    if not page.evaluate(JS_FIND, label): log.append(f"  ✗ {label}: controle não encontrado"); return
    try:
        el = page.query_selector("[data-fill='1']"); el.click(); el.fill(""); el.type(str(value), delay=12)
        _clear(page); log.append(f"  ✓ {label} = {value!r}")
    except Exception as e: log.append(f"  ✗ {label}: {e}")

def pick(page, label, want, log):
    if not page.evaluate(JS_FIND, label): log.append(f"  ✗ {label}: controle não encontrado"); return
    try:
        page.query_selector("[data-fill='1']").click(); time.sleep(0.8)
        wn = _norm(want)
        target = next((o for o in page.query_selector_all("[role=option],[role=menuitem],li[role],[data-testid*=option]")
                       if wn and wn in _norm(o.inner_text() or "")), None)
        if target: target.click(); log.append(f"  ✓ {label} → {want!r}")
        else:      log.append(f"  ✗ {label}: opção {want!r} não listada")
        _clear(page); page.keyboard.press("Escape")
    except Exception as e: log.append(f"  ✗ {label}: {e}")

def pick_radio(page, want, log):
    try: page.get_by_text(want, exact=False).first.click(timeout=4000); log.append(f"  ✓ Empresa → {want!r}")
    except Exception as e: log.append(f"  ✗ Empresa ({want}): {e}")

def fill_form(page, rec, log):
    fill_text(page, "Solicitante",   rec["solicitante"],   log)
    fill_text(page, "Endereço",      rec["endereco"],      log)
    fill_text(page, "Região",        rec["regiao_bairro"], log)
    fill_text(page, "Número da Matr", rec["matricula"],    log)
    fill_text(page, "E-mail",        rec["email"],         log)
    pick(page,      "Cartório",      rec["cartorio"],      log)
    pick(page,      "Finalidade",    rec["finalidade"],    log)
    pick_radio(page,                 rec["empresa"],       log)
    fill_text(page, "Código do Im",  "0",                  log)  # Código do Imóvel NIDO — obrigatório, sem código real
    log.append("  ⤷ PULADO de propósito: Código da Proposta no NIDO")

def _load_db_url():
    """Tenta .env.local primeiro, cai para .env (mesmo formato KEY=VALUE)."""
    for fname in (".env.local", ".env"):
        p = ROOT / fname
        if not p.exists():
            continue
        text = p.read_bytes().decode("utf-8", "replace")
        for line in text.splitlines():
            m = re.match(r'^\s*DATABASE_URL\s*=\s*(.+)$', line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL não encontrado em .env.local nem .env")

def load_from_pipefy():
    """Lê do Pipefy todos os cards em 'Informações Básicas' sem proprietário e com matrícula."""
    import requests
    tok_file = ROOT / "credentials" / "pipefy_token.txt"
    if not tok_file.exists():
        raise SystemExit("[ERRO] credentials/pipefy_token.txt não encontrado. Rode pipefy_token_refresh.py.")
    token = tok_file.read_text(encoding="utf-8").strip()

    res = requests.post("https://api.pipefy.com/graphql",
        json={"query": """
          query {
            pipe(id: 307179010) {
              phases {
                name
                cards(first: 50) {
                  edges { node { id title fields { name value } } }
                }
              }
            }
          }
        """},
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=20).json()

    if "errors" in res:
        raise SystemExit(f"[ERRO] Pipefy GraphQL: {res['errors']}")

    recs = []
    for phase in res["data"]["pipe"]["phases"]:
        if "nforma" not in phase["name"].lower():
            continue
        for edge in phase["cards"]["edges"]:
            card = edge["node"]
            fields = {f["name"]: (f["value"] or "").strip() for f in card["fields"]}

            prop = fields.get("Nome do Proprietário", "")
            mat  = re.sub(r"\.0$", "", fields.get("Matrícula", "").strip())
            if prop or not mat:
                continue   # tem proprietário ou não tem matrícula → pula

            # Endereço — prefere campo Endereço, cai para título (sem o sufixo duplicado do DFImóveis)
            endereco = fields.get("Endereço", "") or re.split(r" — ", card["title"])[0].strip()
            bairro   = fields.get("Bairro", "")

            recs.append({**DEFAULTS,
                "endereco":      endereco,
                "regiao_bairro": bairro,
                "matricula":     mat,
                "cartorio":      cartorio_for(bairro),
                "_card_id":      card["id"],
            })

    return recs


def load_from_gate(limit=None):
    """Fila do gate de dedup (Fase 3): imóveis liberados (não existem no Nido)
    com matrícula recebida e ônus ainda não solicitada."""
    import psycopg2
    url = _load_db_url()
    q = """
      SELECT link, endereco, matricula, bairro, cidade
      FROM onus_pipeline
      WHERE dedup_nivel = 'nenhum'
        AND onus_solicitada_em IS NULL
        AND matricula IS NOT NULL AND btrim(matricula) <> ''
      ORDER BY criado_em
    """ + (f" LIMIT {int(limit)}" if limit else "")
    conn = psycopg2.connect(url)
    cur = conn.cursor(); cur.execute(q); rows = cur.fetchall()
    cur.close(); conn.close()
    recs = []
    for link, endereco, matricula, bairro, cidade in rows:
        regiao = pretty_regiao(cidade) if cidade and cidade != 'Brasília' else (bairro or pretty_regiao(cidade))
        recs.append({**DEFAULTS, "endereco": endereco or "",
                     "regiao_bairro": regiao or "",
                     "matricula": str(matricula), "cartorio": cartorio_for(regiao or ""),
                     "_link": link})
    return recs


def marcar_solicitada(link):
    """Marca onus_solicitada_em=now() após submit de verdade (idempotência da fila)."""
    import psycopg2
    conn = psycopg2.connect(_load_db_url())
    cur = conn.cursor()
    cur.execute("UPDATE onus_pipeline SET onus_solicitada_em = now(), atualizado_em = now() WHERE link = %s", (link,))
    conn.commit(); cur.close(); conn.close()


def load_from_db(limit=None):
    import psycopg2
    url = _load_db_url()
    if not url: raise SystemExit("DATABASE_URL não encontrado")
    q = """
      SELECT COALESCE(
               NULLIF(btrim(endereco),''),
               NULLIF(btrim(concat_ws(', ', pistas_ia->>'quadra', pistas_ia->>'conjunto', pistas_ia->>'casa_lote')),''),
               bairro, titulo) AS endereco,
             cidade, numero_matricula, link, portal
      FROM imoveis_todos
      WHERE numero_matricula IS NOT NULL AND btrim(numero_matricula) NOT IN ('', 'N/A')
      ORDER BY coletado_em DESC
    """ + (f" LIMIT {int(limit)}" if limit else "")
    conn = psycopg2.connect(url)
    cur = conn.cursor(); cur.execute(q); rows = cur.fetchall()
    cur.close(); conn.close()
    recs = []
    for endereco, cidade, matricula, link, portal in rows:
        recs.append({**DEFAULTS, "endereco": endereco or "",
                     "regiao_bairro": pretty_regiao(cidade),       # RA da coluna `cidade`
                     "matricula": str(matricula), "cartorio": cartorio_for(cidade),
                     "_link": link, "_portal": portal})
    return recs

def main():
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    args  = [a for a in sys.argv[1:] if not a.startswith("--")]
    submit      = "--submit"       in flags
    headful     = "--headful"      in flags
    from_db     = "--from-db"      in flags
    from_pipefy = "--from-pipefy"  in flags
    from_gate   = "--from-gate"    in flags

    if from_gate:
        limit = next((int(a) for a in args if a.isdigit()), None)
        recs = load_from_gate(limit)
        print(f"[from-gate] {len(recs)} imóvel(is) liberados pelo dedup aguardando ônus.")
        if not recs:
            print("  → Fila vazia.")
            return
        for i, r in enumerate(recs):
            print(f"   {i+1:>3}. matr {r['matricula']:<10} | {r['endereco']} | {r['regiao_bairro']} | {r['cartorio']}")
        if not submit:
            print("\n  → DRY-RUN: preview do 1º (nada enviado; use --submit).")
            recs = recs[:1]
    elif from_pipefy:
        recs = load_from_pipefy()
        print(f"[from-pipefy] {len(recs)} card(s) sem proprietário e com matrícula em 'Informações Básicas'.")
        if not recs:
            print("  → Nenhum card elegível encontrado.")
            return
        print("  Lista:")
        for i, r in enumerate(recs): print(f"   {i+1:>3}. matr {r['matricula']:<10} | {r['endereco']} | {r['regiao_bairro']}")
        # Matrículas já confirmadas por e-mail do Pipefy — não re-submeter
        ONUS_SUBMETIDOS = {'25063','51051','36521','80888','4587','4694',
                           '94385','24996','89307','104923','31071','35641'}
        antes = len(recs)
        recs = [r for r in recs if str(r.get('matricula','')).replace(',','') not in ONUS_SUBMETIDOS]
        pulados = antes - len(recs)
        if pulados:
            print(f"  ({pulados} ja submetidos anteriormente — pulados)")
        if not submit:
            print("\n  → DRY-RUN: abrindo preview de todos (sem enviar)...")
    elif from_db:
        limit = next((int(a) for a in args if a.isdigit()), None)
        recs = load_from_db(limit)
        print(f"[from-db] {len(recs)} imóvel(is) com matrícula preenchida (≠ N/A).")
        if not recs:
            print("  → Nada a preencher.")
            return
        if not submit:
            print("  Lista que SERIA preenchida (preview do 1º; nada enviado):")
            for i, r in enumerate(recs): print(f"   {i+1:>3}. matr {r['matricula']:<10} | {r['endereco']} | {r['regiao_bairro']}")
            recs = recs[:1]
    else:
        data = json.loads(Path(args[0]).read_bytes().decode("utf-8", "replace")) if args and Path(args[0]).exists() else {}
        if not data: print("[dry] sem JSON -> amostra [TESTE], não envio.")
        regiao = data.get("regiao_bairro", "Asa Norte")
        recs = [{**DEFAULTS, **{
            "endereco":      data.get("endereco", "[TESTE] SQN 100 Bloco A Ap 101"),
            "regiao_bairro": regiao,
            "matricula":     str(data.get("matricula", "000000")),
            "cartorio":      data.get("cartorio") or cartorio_for(regiao),
            **{k: data[k] for k in ("solicitante","email","finalidade","empresa") if k in data},
        }}]

    if not SESSION.exists(): sys.exit(f"[ERRO] sessão ausente: {SESSION}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headful)
        ctx = browser.new_context(storage_state=str(SESSION), viewport={"width":1440,"height":1000})
        page = ctx.new_page()
        for i, rec in enumerate(recs):
            log = [f"imóvel {i+1}/{len(recs)} — matr {rec['matricula']}"]
            page.goto(URL, timeout=45000)
            try: page.wait_for_load_state("networkidle", timeout=20000)
            except Exception: pass
            time.sleep(4)
            if "/login" in page.url or "app-auth" in page.url:
                print("[ERRO] sessão expirada -> rode pipefy_auth_setup.py"); browser.close(); sys.exit(2)
            fill_form(page, rec, log)
            shot = SHOTDIR / (f"portal_{i+1:03d}.png" if from_db else "portal_filled.png")
            time.sleep(1); page.screenshot(path=str(shot), full_page=True)
            print("\n".join(log)); print(f"  screenshot: {shot}")
            if submit:
                btn = page.query_selector("button:has-text('Criar novo card')") or page.query_selector("button:has-text('Enviar')")
                if btn:
                    btn.click(); time.sleep(3); print("  → ENVIADO.")
                    if from_gate and rec.get("_link"):
                        marcar_solicitada(rec["_link"])
                        print("  → onus_solicitada_em marcado no banco.")
                else:
                    print("  [!] botão de envio não encontrado — não enviei.")
            else:
                print("  → NÃO enviei (use --submit pra enviar de verdade).")
        browser.close()

if __name__ == "__main__":
    main()
