"""
Scraper: direcional.com.br → Supabase (tabela empreendimentos)
Filtra apenas DF. Uso: python scripts/direcional_sync.py
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

FONTE  = "direcional"
BASE   = "https://www.direcional.com.br"
LIST_URL = f"{BASE}/encontre-seu-apartamento/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TRKScraper/1.0)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

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

def collect_slugs() -> list[tuple[str, str]]:
    slugs, seen = [], set()
    try:
        soup = get(LIST_URL)
    except Exception as e:
        log.warning("Falha ao acessar listagem: %s", e)
        return slugs
    for a in soup.select("a[href*='/empreendimentos/']"):
        href = a.get("href", "")
        m = re.search(r"/empreendimentos/([^/?#]+)/?", href)
        if not m:
            continue
        slug = m.group(1).strip("/")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        slugs.append((slug, urljoin(BASE, href)))
    log.info("Slugs encontrados: %d", len(slugs))
    return slugs

def is_df(page_text: str) -> bool:
    tl = page_text.lower()
    # Verifica menção explícita de bairros/cidades do DF — mais confiável que negar outros estados
    df_specific = ["lago sul", "lago norte", "asa sul", "asa norte", "noroeste", "sudoeste",
                   "park way", "park sul", "ceilândia", "ceilandia", "taguatinga",
                   "distrito federal", "brasília", "brasilia"]
    return any(m in tl for m in df_specific)

def scrape(slug: str, url: str) -> dict | None:
    soup = get(url)
    page_text = soup.get_text(" ", strip=True)
    if not is_df(page_text):
        log.info("Ignorado (não é DF): %s", slug)
        return None

    nome = txt(soup.select_one("h1")) or slug.replace("-", " ").title()

    tipo = None
    for sel in [".categoria",".tipo","[class*='tipo']","[class*='category']",".tag"]:
        el = soup.select_one(sel)
        if el:
            tipo = txt(el)
            break
    if not tipo:
        tl = page_text.lower()
        if "apart-hotel" in tl or "apart hotel" in tl:
            tipo = "Apart-Hotel"
        elif "corporativo" in tl or "comercial" in tl:
            tipo = "Corporativo"
        else:
            tipo = "Residencial"

    status = None
    if re.search(r"pronto\s+para\s+morar", page_text, re.I):
        status = "pronto"
    elif re.search(r"em\s+obras", page_text, re.I):
        status = "em_obras"
    elif re.search(r"breve\s+lan[çc]amento", page_text, re.I):
        status = "breve_lancamento"
    elif re.search(r"lan[çc]amento", page_text, re.I):
        status = "lancamento"

    pct_obras = None
    for pattern in [
        r"(\d+(?:[.,]\d+)?)\s*%\s*(?:conclu[íi]d|de\s+obra|executad)",
        r"(?:obra|execu[çc][ãa]o)[^\d]*(\d+(?:[.,]\d+)?)\s*%",
    ]:
        m = re.search(pattern, page_text, re.I)
        if m:
            pct_obras = float(m.group(1).replace(",", "."))
            break
    if pct_obras is None:
        for el in soup.select("[data-percent],[data-progress]"):
            v = el.get("data-percent") or el.get("data-progress")
            if v:
                pct_obras = num(v)
                break
    if pct_obras is None and status == "pronto":
        pct_obras = 100.0
    if pct_obras >= 100.0:
        status = "pronto"

    bairro = None
    for b in ["Lago Sul","Lago Norte","Asa Sul","Asa Norte","Noroeste","Sudoeste","Park Way","Park Sul","Jardim Botânico","Águas Claras","Taguatinga","Park Sul"]:
        if b.lower() in page_text.lower():
            bairro = b
            break

    endereco = None
    for sel in [".endereco",".localizacao","[class*='address']","[class*='local']","[class*='endereco']"]:
        el = soup.select_one(sel)
        if el:
            endereco = txt(el)
            break

    area_matches = re.findall(r"(\d+(?:[.,]\d+)?)\s*m[²2]", page_text)
    areas = sorted(set(float(a.replace(",", ".")) for a in area_matches if float(a.replace(",", ".")) > 20))
    area_min = areas[0] if areas else None
    area_max = areas[-1] if areas else None

    total_unidades = None
    m = re.search(r"(\d+)\s+(?:unidades|apartamentos|ap[ta]s?)\b", page_text, re.I)
    if m:
        total_unidades = int(m.group(1))

    suites_max = None
    m = re.search(r"(\d+)\s+su[íi]tes?", page_text, re.I)
    if m:
        suites_max = int(m.group(1))

    vagas_min, vagas_max = None, None
    vagas = re.findall(r"(\d+)\s+(?:vagas?|estacionamento)", page_text, re.I)
    if vagas:
        ns = sorted(int(v) for v in vagas)
        vagas_min, vagas_max = ns[0], ns[-1]

    preco_min, preco_max = None, None
    precos = re.findall(r"R\$\s*([\d.,]+)", page_text)
    if precos:
        vals = sorted(float(p.replace(".", "").replace(",", ".")) for p in precos if float(p.replace(".", "").replace(",", ".")) > 50_000)
        if vals:
            preco_min, preco_max = vals[0], vals[-1]

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

    diferenciais = []
    for sel in ["ul.diferenciais li",".features li",".amenidades li",".diferenciais li",".diferencial"]:
        items = soup.select(sel)
        if items:
            diferenciais = [txt(i) for i in items if txt(i)]
            break

    descricao = None
    for sel in [".descricao",".description",".sobre","article p",".content p",".texto p"]:
        el = soup.select_one(sel)
        if el and len(txt(el) or "") > 40:
            descricao = txt(el)
            break

    return {
        "fonte": FONTE, "slug": slug, "nome": nome, "url": url,
        "tipo": tipo, "status": status, "pct_obras": pct_obras,
        "bairro": bairro, "endereco": endereco,
        "area_min": area_min, "area_max": area_max,
        "total_unidades": total_unidades, "suites_max": suites_max,
        "vagas_min": vagas_min, "vagas_max": vagas_max,
        "preco_min": preco_min, "preco_max": preco_max,
        "tipologias": tipologias, "diferenciais": diferenciais,
        "descricao": descricao,
    }

UPSERT_SQL = """
INSERT INTO empreendimentos (
  fonte, slug, nome, url, tipo, status, pct_obras,
  bairro, endereco, cidade, estado,
  area_min_m2, area_max_m2, total_unidades,
  suites_max, vagas_min, vagas_max, preco_min, preco_max,
  tipologias, diferenciais, descricao, dados_raw, scraped_at
) VALUES %s
ON CONFLICT (fonte, slug) DO UPDATE SET
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
  preco_min      = EXCLUDED.preco_min,
  preco_max      = EXCLUDED.preco_max,
  tipologias     = EXCLUDED.tipologias,
  diferenciais   = EXCLUDED.diferenciais,
  descricao      = EXCLUDED.descricao,
  dados_raw      = EXCLUDED.dados_raw,
  scraped_at     = EXCLUDED.scraped_at
"""

def upsert(conn, rows: list[dict]):
    values = [(
        r["fonte"], r["slug"], r["nome"], r["url"],
        r.get("tipo"), r.get("status"), r.get("pct_obras"),
        r.get("bairro"), r.get("endereco"), "Brasília", "DF",
        r.get("area_min"), r.get("area_max"), r.get("total_unidades"),
        r.get("suites_max"), r.get("vagas_min"), r.get("vagas_max"),
        r.get("preco_min"), r.get("preco_max"),
        json.dumps(r.get("tipologias") or [], ensure_ascii=False),
        r.get("diferenciais") or [],
        r.get("descricao"),
        json.dumps(r, ensure_ascii=False, default=str),
        datetime.now(timezone.utc),
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("Upsert: %d empreendimentos", len(values))

def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    slugs = collect_slugs()
    rows = []
    for i, (slug, url) in enumerate(slugs, 1):
        log.info("[%d/%d] %s", i, len(slugs), slug)
        try:
            data = scrape(slug, url)
            if data:
                rows.append(data)
        except Exception as e:
            log.warning("Falha em %s: %s", slug, e)
        time.sleep(1.5)
    if rows:
        upsert(conn, rows)
        log.info("Concluído — %d/%d salvos", len(rows), len(slugs))
    conn.close()

if __name__ == "__main__":
    main()
