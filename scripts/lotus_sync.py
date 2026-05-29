"""
Scraper: lotuscidade.com.br → Supabase (tabela lotus_empreendimentos)
Uso: python scripts/lotus_sync.py
Deps: requests beautifulsoup4 psycopg2-binary
"""
import os, re, json, time, logging
from datetime import datetime, timezone
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE   = "https://lotuscidade.com.br"
LIST   = f"{BASE}/empreendimentos/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VelvetScraper/1.0)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# ── helpers ───────────────────────────────────────────────────────────────────

def get(url: str) -> BeautifulSoup:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")

def txt(el) -> str | None:
    return el.get_text(" ", strip=True) if el else None

def num(s: str | None) -> float | None:
    if not s:
        return None
    clean = re.sub(r"[^\d,.]", "", s).replace(",", ".")
    try:
        return float(clean)
    except ValueError:
        return None

def pct(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", s)
    return float(m.group(1).replace(",", ".")) if m else None

# ── coleta slugs da página de listagem ───────────────────────────────────────

def collect_slugs() -> list[tuple[str, str]]:
    soup = get(LIST)
    slugs = []
    seen = set()
    for a in soup.select("a[href*='/empreendimentos/']"):
        href = a["href"]
        m = re.search(r"/empreendimentos/([^/?#]+)/?", href)
        if not m:
            continue
        slug = m.group(1).strip("/")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        url = urljoin(BASE, href)
        slugs.append((slug, url))
    log.info("Slugs encontrados: %d", len(slugs))
    return slugs

# ── scrape de uma página de empreendimento ───────────────────────────────────

def scrape_empreendimento(slug: str, url: str) -> dict:
    soup = get(url)
    raw: dict = {"url": url}

    # nome
    nome = (
        txt(soup.select_one("h1"))
        or txt(soup.select_one(".empreendimento-titulo"))
        or slug.replace("-", " ").title()
    )

    # tipo — tenta meta, breadcrumb, ou tag de categoria
    tipo = None
    for sel in [".categoria", ".tipo", "[class*='tipo']", "[class*='category']"]:
        el = soup.select_one(sel)
        if el:
            tipo = txt(el)
            break
    if not tipo:
        text_lower = soup.get_text().lower()
        if "apart-hotel" in text_lower:
            tipo = "Apart-Hotel"
        elif "corporativo" in text_lower:
            tipo = "Corporativo"
        else:
            tipo = "Residencial"

    # status
    status = None
    page_text = soup.get_text(" ", strip=True)
    if re.search(r"pronto\s+para\s+morar", page_text, re.I):
        status = "pronto"
    elif re.search(r"em\s+obras", page_text, re.I):
        status = "em_obras"
    elif re.search(r"lan[çc]amento", page_text, re.I):
        status = "lancamento"
    elif re.search(r"breve\s+lan[çc]amento", page_text, re.I):
        status = "breve_lancamento"

    # % obras — procura "X% concluído", "X% de obras", barras de progresso
    pct_obras = None
    for pattern in [
        r"(\d+(?:[.,]\d+)?)\s*%\s*(?:conclu[íi]d|de\s+obra|executad)",
        r"(?:obra|execu[çc][ãa]o)[^\d]*(\d+(?:[.,]\d+)?)\s*%",
    ]:
        m = re.search(pattern, page_text, re.I)
        if m:
            pct_obras = float(m.group(1).replace(",", "."))
            break
    # fallback: progress bar data-percent ou style width
    if pct_obras is None:
        for el in soup.select("[data-percent],[data-progress]"):
            v = el.get("data-percent") or el.get("data-progress")
            if v:
                pct_obras = num(v)
                break
    if pct_obras is None and status == "pronto":
        pct_obras = 100.0

    # endereço
    endereco, bairro = None, None
    for sel in [".endereco", ".localizacao", "[class*='address']", "[class*='local']"]:
        el = soup.select_one(sel)
        if el:
            endereco = txt(el)
            break
    if not endereco:
        m = re.search(r"(SQ[NS]\w*[\d\s,\w]+(?:Bloco\s+\w+)?[,\s]+[\w\s]+(?:–|-)[\s\w]+DF)", page_text)
        if m:
            endereco = m.group(1).strip()
    # bairro da URL ou do endereço
    bairros_conhecidos = [
        "Asa Sul", "Asa Norte", "Noroeste", "Lago Sul", "Lago Norte",
        "Sudoeste", "Park Sul", "Park Way", "Jardim Botânico",
    ]
    for b in bairros_conhecidos:
        if b.lower() in page_text.lower():
            bairro = b
            break

    # áreas
    area_min, area_max = None, None
    area_matches = re.findall(r"(\d+(?:[.,]\d+)?)\s*m[²2]", page_text)
    areas = sorted(set(float(a.replace(",", ".")) for a in area_matches if float(a.replace(",", ".")) > 20))
    if areas:
        area_min = areas[0]
        area_max = areas[-1]

    # unidades
    total_unidades = None
    m = re.search(r"(\d+)\s+(?:unidades|apartamentos|ap[ta]s?)\b", page_text, re.I)
    if m:
        total_unidades = int(m.group(1))

    # suítes / quartos
    suites_max = None
    m = re.search(r"(\d+)\s+su[íi]tes?", page_text, re.I)
    if m:
        suites_max = int(m.group(1))

    # vagas
    vagas_min, vagas_max = None, None
    vagas = re.findall(r"(\d+)\s+(?:vagas?|estacionamento)", page_text, re.I)
    if vagas:
        nums = sorted(int(v) for v in vagas)
        vagas_min, vagas_max = nums[0], nums[-1]

    # tipologias — ex: "1 quarto — 39m² a 61m²"
    tipologias = []
    for m in re.finditer(
        r"(\d+)\s*(?:quartos?|dormit[óo]rios?|su[íi]tes?)[^\d]*(\d+(?:[.,]\d+)?)\s*m[²2]"
        r"(?:\s*(?:a|ao|até)\s*(\d+(?:[.,]\d+)?)\s*m[²2])?",
        page_text, re.I
    ):
        tipologias.append({
            "quartos": int(m.group(1)),
            "area_min": float(m.group(2).replace(",", ".")),
            "area_max": float(m.group(3).replace(",", ".")) if m.group(3) else None,
        })

    # diferenciais
    diferenciais = []
    for sel in ["ul.diferenciais li", ".features li", ".amenidades li", ".diferenciais li"]:
        items = soup.select(sel)
        if items:
            diferenciais = [txt(i) for i in items if txt(i)]
            break

    # créditos
    arquitetura, interiores, paisagismo = None, None, None
    for m in re.finditer(r"(arquitetura|interiores?|paisagismo)[:\s]+([^\n|•]+)", page_text, re.I):
        label, value = m.group(1).lower(), m.group(2).strip()
        if "arquitetura" in label and not arquitetura:
            arquitetura = value
        elif "interior" in label and not interiores:
            interiores = value
        elif "paisagismo" in label and not paisagismo:
            paisagismo = value

    # descrição
    descricao = None
    for sel in [".descricao", ".description", ".sobre", "article p", ".content p"]:
        el = soup.select_one(sel)
        if el and len(txt(el) or "") > 40:
            descricao = txt(el)
            break

    raw.update({
        "nome": nome, "tipo": tipo, "status": status, "pct_obras": pct_obras,
        "endereco": endereco, "bairro": bairro,
        "area_min": area_min, "area_max": area_max,
        "total_unidades": total_unidades, "suites_max": suites_max,
        "vagas_min": vagas_min, "vagas_max": vagas_max,
        "tipologias": tipologias, "diferenciais": diferenciais,
        "arquitetura": arquitetura, "interiores": interiores, "paisagismo": paisagismo,
        "descricao": descricao,
    })
    return raw

# ── upsert no Supabase ────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO lotus_empreendimentos (
  slug, nome, url, tipo, status, pct_obras,
  bairro, endereco, cidade, estado,
  area_min_m2, area_max_m2, total_unidades,
  suites_max, vagas_min, vagas_max,
  tipologias, diferenciais,
  arquitetura, interiores, paisagismo,
  descricao, dados_raw, scraped_at
) VALUES %s
ON CONFLICT (slug) DO UPDATE SET
  nome           = EXCLUDED.nome,
  url            = EXCLUDED.url,
  tipo           = EXCLUDED.tipo,
  status         = EXCLUDED.status,
  pct_obras      = EXCLUDED.pct_obras,
  bairro         = EXCLUDED.bairro,
  endereco       = EXCLUDED.endereco,
  area_min_m2    = EXCLUDED.area_min_m2,
  area_max_m2    = EXCLUDED.area_max_m2,
  total_unidades = EXCLUDED.total_unidades,
  suites_max     = EXCLUDED.suites_max,
  vagas_min      = EXCLUDED.vagas_min,
  vagas_max      = EXCLUDED.vagas_max,
  tipologias     = EXCLUDED.tipologias,
  diferenciais   = EXCLUDED.diferenciais,
  arquitetura    = EXCLUDED.arquitetura,
  interiores     = EXCLUDED.interiores,
  paisagismo     = EXCLUDED.paisagismo,
  descricao      = EXCLUDED.descricao,
  dados_raw      = EXCLUDED.dados_raw,
  scraped_at     = EXCLUDED.scraped_at
"""

def upsert(conn, rows: list[dict]):
    values = [
        (
            r["slug"], r["nome"], r["url"], r.get("tipo"), r.get("status"),
            r.get("pct_obras"),
            r.get("bairro"), r.get("endereco"), "Brasília", "DF",
            r.get("area_min"), r.get("area_max"), r.get("total_unidades"),
            r.get("suites_max"), r.get("vagas_min"), r.get("vagas_max"),
            json.dumps(r.get("tipologias") or [], ensure_ascii=False),
            r.get("diferenciais") or [],
            r.get("arquitetura"), r.get("interiores"), r.get("paisagismo"),
            r.get("descricao"),
            json.dumps(r, ensure_ascii=False, default=str),
            datetime.now(timezone.utc),
        )
        for r in rows
    ]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("Upsert: %d empreendimentos", len(values))

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)

    slugs = collect_slugs()
    rows = []
    for i, (slug, url) in enumerate(slugs, 1):
        log.info("[%d/%d] scraping %s", i, len(slugs), slug)
        try:
            data = scrape_empreendimento(slug, url)
            data["slug"] = slug
            rows.append(data)
        except Exception as e:
            log.warning("Falha em %s: %s", slug, e)
        time.sleep(1.2)

    if rows:
        upsert(conn, rows)
        log.info("Concluído — %d/%d empreendimentos salvos", len(rows), len(slugs))
    conn.close()

if __name__ == "__main__":
    main()
