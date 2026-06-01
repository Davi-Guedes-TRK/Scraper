"""
Scraper: chavesnamao.com.br → Supabase (tabela imoveis_chavesnamao)
Filtra pelas regiões alvo do DF. Uso: python scripts/chaves_sync.py
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

BASE = "https://www.chavesnamao.com.br"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TRKScraper/1.0)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# Chaves na Mão usa URL por estado — coletamos todo o DF e filtramos por bairro
BAIRROS = [
    ("DF", "df"),
]

def get(url: str) -> BeautifulSoup:
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")

def txt(el) -> str | None:
    return el.get_text(" ", strip=True) if el else None

def collect_links_for_bairro(bairro_nome: str, bairro_slug: str) -> list[tuple[str, str]]:
    links = []
    seen = set()
    page = 1
    while True:
        # tenta padrão de URL com e sem trailing slash / paginação
        url = f"{BASE}/imoveis-para-alugar/{bairro_slug}/"
        if page > 1:
            url = f"{BASE}/imoveis-para-alugar/{bairro_slug}/?page={page}"
        try:
            soup = get(url)
        except Exception as e:
            log.warning("[%s] Página %d falhou: %s", bairro_nome, page, e)
            break

        found = 0
        for a in soup.select("a[href*='/imovel/'], a[href*='/anuncio/']"):
            href = a.get("href", "")
            m = re.search(r"/(?:imovel|anuncio|imoveis)/([^/?#]+)/?", href)
            if not m:
                continue
            slug = m.group(1).strip("/")
            if not slug or slug in seen:
                continue
            seen.add(slug)
            links.append((slug, urljoin(BASE, href), bairro_nome))
            found += 1

        if found == 0:
            break
        log.info("[%s] Página %d: %d links", bairro_nome, page, found)
        page += 1
        if page > 20:  # segurança
            break
        time.sleep(1.0)
    return links

def scrape(slug: str, url: str, bairro_hint: str) -> dict:
    soup = get(url)
    page_text = soup.get_text(" ", strip=True)

    titulo = txt(soup.select_one("h1")) or slug.replace("-", " ").title()

    preco = None
    for sel in [".preco", ".price", "[class*='preco']", "[class*='price']", "[class*='valor']"]:
        el = soup.select_one(sel)
        if el:
            preco = txt(el)
            break
    if not preco:
        m = re.search(r"R\$\s*([\d.,]+)", page_text)
        if m:
            preco = f"R$ {m.group(1)}"

    area_m2 = None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*m[²2]", page_text)
    if m:
        area_m2 = m.group(1)

    quartos = None
    m = re.search(r"(\d+)\s*(?:quartos?|dorm)", page_text, re.I)
    if m:
        quartos = m.group(1)

    suites = None
    m = re.search(r"(\d+)\s*su[íi]tes?", page_text, re.I)
    if m:
        suites = m.group(1)

    vagas = None
    m = re.search(r"(\d+)\s*(?:vagas?|garagem)", page_text, re.I)
    if m:
        vagas = m.group(1)

    banheiros = None
    m = re.search(r"(\d+)\s*(?:banheiros?|wc)", page_text, re.I)
    if m:
        banheiros = m.group(1)

    tipo_imovel = None
    for sel in [".tipo", "[class*='tipo']", ".categoria"]:
        el = soup.select_one(sel)
        if el:
            tipo_imovel = txt(el)
            break

    bairro = bairro_hint
    for sel in [".bairro", ".localizacao", "[class*='bairro']", "[class*='local']"]:
        el = soup.select_one(sel)
        if el:
            bairro = txt(el) or bairro
            break

    endereco = None
    for sel in [".endereco", ".address", "[class*='endereco']", "[class*='address']"]:
        el = soup.select_one(sel)
        if el:
            endereco = txt(el)
            break

    descricao = None
    for sel in [".descricao", ".description", ".obs", "article p", ".content p"]:
        el = soup.select_one(sel)
        if el and len(txt(el) or "") > 40:
            descricao = txt(el)
            break

    telefone = None
    m = re.search(r"(?:\+55\s*)?(?:\(?\d{2}\)?[\s-]?)(?:9\s?)?\d{4}[-\s]?\d{4}", page_text)
    if m:
        telefone = m.group(0).strip()

    nome_anunciante = None
    for sel in [".anunciante", ".proprietario", "[class*='anunciante']", "[class*='owner']"]:
        el = soup.select_one(sel)
        if el:
            nome_anunciante = txt(el)
            break

    tipo_anunciante = None
    page_lower = page_text.lower()
    if re.search(r"imobili[áa]ria|corretor|\bcreci\b", page_lower):
        tipo_anunciante = "imobiliaria"
    elif re.search(r"propriet[áa]rio|dono|particular", page_lower):
        tipo_anunciante = "proprietario"

    creci = None
    m = re.search(r"creci[:\s]*([A-Z0-9\-/]+)", page_text, re.I)
    if m:
        creci = m.group(1).strip()

    imagens = []
    for img in soup.select("img[src*='foto'], img[src*='photo'], img[src*='image'], .galeria img, .slider img"):
        src = img.get("src") or img.get("data-src")
        if src and src.startswith("http"):
            imagens.append(src)

    id_anuncio = slug

    return {
        "link": url, "titulo": titulo, "preco": preco,
        "area_m2": area_m2, "quartos": quartos, "suites": suites,
        "vagas": vagas, "banheiros": banheiros,
        "tipo_imovel": tipo_imovel, "tipo": tipo_imovel,
        "bairro": bairro, "cidade": "Brasília", "estado": "DF",
        "endereco": endereco, "descricao": descricao,
        "telefone": telefone, "nome_anunciante": nome_anunciante,
        "tipo_anunciante": tipo_anunciante, "creci": creci,
        "id_anuncio": id_anuncio,
        "imagens": ",".join(imagens) if imagens else None,
        "dados_brutos": page_text[:2000],
    }

UPSERT_SQL = """
INSERT INTO imoveis_chavesnamao (
  link, titulo, preco, area_m2, quartos, suites, vagas, banheiros,
  tipo_imovel, tipo, bairro, cidade, estado, endereco, descricao,
  telefone, nome_anunciante, tipo_anunciante, creci, id_anuncio,
  imagens, dados_brutos, coletado_em, atualizado_em, ativo
) VALUES %s
ON CONFLICT (link) DO UPDATE SET
  titulo          = EXCLUDED.titulo,
  preco           = EXCLUDED.preco,
  area_m2         = EXCLUDED.area_m2,
  quartos         = EXCLUDED.quartos,
  suites          = EXCLUDED.suites,
  vagas           = EXCLUDED.vagas,
  banheiros       = EXCLUDED.banheiros,
  tipo_imovel     = EXCLUDED.tipo_imovel,
  tipo            = EXCLUDED.tipo,
  bairro          = EXCLUDED.bairro,
  endereco        = EXCLUDED.endereco,
  descricao       = EXCLUDED.descricao,
  telefone        = EXCLUDED.telefone,
  nome_anunciante = EXCLUDED.nome_anunciante,
  tipo_anunciante = EXCLUDED.tipo_anunciante,
  creci           = EXCLUDED.creci,
  imagens         = EXCLUDED.imagens,
  dados_brutos    = EXCLUDED.dados_brutos,
  atualizado_em   = EXCLUDED.atualizado_em,
  ativo           = true
"""

def upsert(conn, rows: list[dict]):
    now = datetime.now(timezone.utc)
    values = [(
        r["link"], r["titulo"], r.get("preco"), r.get("area_m2"),
        r.get("quartos"), r.get("suites"), r.get("vagas"), r.get("banheiros"),
        r.get("tipo_imovel"), r.get("tipo"),
        r.get("bairro"), r.get("cidade", "Brasília"), r.get("estado", "DF"),
        r.get("endereco"), r.get("descricao"),
        r.get("telefone"), r.get("nome_anunciante"), r.get("tipo_anunciante"),
        r.get("creci"), r.get("id_anuncio"),
        r.get("imagens"),
        json.dumps({"raw_preview": r.get("dados_brutos", "")}, ensure_ascii=False),
        now, now, True,
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("Upsert: %d anúncios", len(values))

def deactivate_missing(conn, bairros_processados: list[str], links_vistos: set[str]):
    if not links_vistos:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE imoveis_chavesnamao
               SET ativo = false
             WHERE ativo = true
               AND bairro = ANY(%s)
               AND link != ALL(%s)
               AND atualizado_em < NOW() - INTERVAL '2 days'
            """,
            (bairros_processados, list(links_vistos)),
        )
        desativados = cur.rowcount
    conn.commit()
    if desativados:
        log.info("Desativados (não vistos): %d anúncios", desativados)

def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    all_rows = []
    bairros_processados = []

    for bairro_nome, bairro_slug in BAIRROS:
        log.info("=== %s ===", bairro_nome)
        links = collect_links_for_bairro(bairro_nome, bairro_slug)
        if links:
            bairros_processados.append(bairro_nome)
        for i, (slug, url, bairro) in enumerate(links, 1):
            log.info("[%d/%d] %s", i, len(links), slug)
            try:
                all_rows.append(scrape(slug, url, bairro))
            except Exception as e:
                log.warning("Falha em %s: %s", slug, e)
            time.sleep(1.2)
        time.sleep(2.0)

    if all_rows:
        upsert(conn, all_rows)
        links_vistos = {r["link"] for r in all_rows}
        deactivate_missing(conn, bairros_processados, links_vistos)
        log.info("Concluído — %d anúncios salvos", len(all_rows))
    conn.close()

if __name__ == "__main__":
    main()
