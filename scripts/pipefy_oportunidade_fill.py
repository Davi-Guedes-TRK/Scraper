"""
Cria cards no pipe "COM - Oportunidades" (307179010) a partir da fila de curadoria,
usando a SESSÃO salva (sem API) — mesmo método do pipefy_portal_fill.py.

Fonte: tabela public.oportunidades_fila onde status='pendente'
  (alimentada pela aba Curadoria do /captacao "Alugamos não Adm").

Fluxo: abre o pipe -> botão "Novo card" -> preenche o formulário inicial POR RÓTULO
  -> (com --submit) cria e marca status='criado'.

Uso:
  python scripts/pipefy_oportunidade_fill.py            # dry-run: lista a fila, preenche o 1º sem enviar
  python scripts/pipefy_oportunidade_fill.py --submit   # cria de verdade + marca criado
  flags extras: --headful (mostra o browser), --limit N

⚠️ 1ª vez: rode com --headful pra conferir o botão de "Novo card" e os rótulos do form.
   O preenchimento é por rótulo (robusto), mas o botão de abrir card pode variar — ajuste
   OPEN_SELECTORS / SUBMIT_SELECTORS se necessário (igual foi com o SEC|Ônus).
"""
import re, sys, time, unicodedata
from pathlib import Path
from playwright.sync_api import sync_playwright

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT    = Path(__file__).parent.parent
SESSION = ROOT / "credentials" / "pipefy_session.json"
SHOTDIR = ROOT / "credentials"
PIPE_ID = "307179010"
PIPE_URL = f"https://app.pipefy.com/pipes/{PIPE_ID}"

OPEN_SELECTORS = [
    "[data-testid*='new-card']", "[data-testid*='create-card']",
    "button:has-text('Novo card')", "button:has-text('Criar card')",
    "button:has-text('New card')", "a:has-text('Novo card')",
    "button[aria-label*='Novo' i]", "[aria-label*='new card' i]",
]
SUBMIT_SELECTORS = [
    "button:has-text('Criar card')", "button:has-text('Criar novo card')",
    "button:has-text('Criar')", "button:has-text('Create card')", "button:has-text('Done')",
]

# Localiza o controle (input/select) ligado a um rótulo — igual ao portal_fill.
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

def _norm(s):
    t = unicodedata.normalize('NFKD', s or '')
    t = ''.join(c for c in t if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()

def _clear(page):
    page.evaluate("document.querySelectorAll('[data-fill]').forEach(x=>x.removeAttribute('data-fill'))")

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

def fill_oportunidade(page, rec, log):
    titulo = rec["endereco"] or rec["codigo_imovel"]
    fill_text(page, "Título",               titulo,               log)   # se não houver rótulo, ignora
    fill_text(page, "Endereço",             rec["endereco"],      log)
    fill_text(page, "Bairro",               rec["bairro"],        log)
    pick(page,      "Tipo de Imóvel",       rec["tipo_imovel"],   log)
    fill_text(page, "Nome do Proprietário", rec["proprietario"],  log)
    fill_text(page, "Telefone",             rec["telefone"],      log)   # casa "Telefone/Contato"
    fill_text(page, "Valor Estimado",       rec["valor"],         log)
    pick(page,      "Origem da Oportunidade", "Captado por Corretor", log)
    pick(page,      "Tem Cadastro no Nido", "Sim",                log)

def db_conn():
    import psycopg2
    env = (ROOT / ".env.local").read_bytes().decode("utf-8", "replace")
    url = next((re.match(r'^\s*DATABASE_URL\s*=\s*(.+)$', l).group(1).strip().strip('"').strip("'")
                for l in env.splitlines() if re.match(r'^\s*DATABASE_URL\s*=', l)), None)
    if not url: raise SystemExit("DATABASE_URL não encontrado em .env.local")
    return psycopg2.connect(url)

def load_fila(conn, limit=None):
    q = ("SELECT codigo_imovel, proprietario, telefone, tipo_imovel, bairro, endereco, valor_locacao "
         "FROM public.oportunidades_fila WHERE status='pendente' ORDER BY criado_em"
         + (f" LIMIT {int(limit)}" if limit else ""))
    cur = conn.cursor(); cur.execute(q); rows = cur.fetchall(); cur.close()
    return [{
        "codigo_imovel": r[0], "proprietario": r[1] or "", "telefone": r[2] or "",
        "tipo_imovel": r[3] or "", "bairro": r[4] or "", "endereco": r[5] or "",
        "valor": (str(int(r[6])) if r[6] else ""),
    } for r in rows]

def marca_criado(conn, codigo):
    cur = conn.cursor()
    cur.execute("UPDATE public.oportunidades_fila SET status='criado', card_criado_em=now() WHERE codigo_imovel=%s", (codigo,))
    conn.commit(); cur.close()

def open_new_card(page, log):
    page.goto(PIPE_URL, timeout=45000)
    try: page.wait_for_load_state("networkidle", timeout=20000)
    except Exception: pass
    time.sleep(3)
    if "/login" in page.url or "app-auth" in page.url:
        raise SystemExit("[ERRO] sessão expirada -> rode pipefy_auth_setup.py / pipefy_token_refresh.py")
    for sel in OPEN_SELECTORS:
        btn = page.query_selector(sel)
        if btn:
            btn.click(); time.sleep(2.5); log.append(f"  novo card via {sel!r}"); return True
    log.append("  ✗ botão 'Novo card' não encontrado — rode --headful e ajuste OPEN_SELECTORS")
    return False

def main():
    flags  = [a for a in sys.argv[1:] if a.startswith("--")]
    args   = [a for a in sys.argv[1:] if not a.startswith("--")]
    submit  = "--submit" in flags
    headful = "--headful" in flags
    limit = next((int(a) for a in args if a.isdigit()),
                 next((int(flags[flags.index("--limit") + 1]) for _ in [0] if "--limit" in flags and flags.index("--limit") + 1 < len(flags)), None))

    if not SESSION.exists(): sys.exit(f"[ERRO] sessão ausente: {SESSION} (rode pipefy_auth_setup.py)")

    conn = db_conn()
    recs = load_fila(conn, limit)
    print(f"[fila] {len(recs)} imóvel(is) pendente(s) na oportunidades_fila.")
    if not recs:
        print("  → Nada na fila. Selecione imóveis na aba Curadoria do /captacao e clique 'Criar oportunidades'.")
        return
    for i, r in enumerate(recs):
        print(f"   {i+1:>3}. {r['codigo_imovel']:<10} | {r['endereco'] or r['bairro']} | {r['proprietario']}")
    if not submit:
        print("\n[dry-run] sem --submit: preencho só o 1º (sem criar) pra você conferir o form.")
        recs = recs[:1]

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headful)
        ctx = browser.new_context(storage_state=str(SESSION), viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        for i, rec in enumerate(recs):
            log = [f"card {i+1}/{len(recs)} — {rec['codigo_imovel']}"]
            if not open_new_card(page, log):
                print("\n".join(log)); break
            fill_oportunidade(page, rec, log)
            time.sleep(1)
            page.screenshot(path=str(SHOTDIR / f"oportunidade_{i+1:03d}.png"), full_page=True)
            if submit:
                btn = next((page.query_selector(s) for s in SUBMIT_SELECTORS if page.query_selector(s)), None)
                if btn:
                    btn.click(); time.sleep(3); marca_criado(conn, rec["codigo_imovel"]); log.append("  → CRIADO + marcado.")
                else:
                    log.append("  [!] botão de criar não encontrado — NÃO criei (ajuste SUBMIT_SELECTORS).")
            else:
                log.append("  → NÃO criei (dry-run; use --submit).")
            print("\n".join(log))
        browser.close()
    conn.close()

if __name__ == "__main__":
    main()
