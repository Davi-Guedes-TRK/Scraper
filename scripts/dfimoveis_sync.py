"""
Scraper: dfimoveis.com.br → Supabase (tabela imoveis_dfimoveis)
Coleta anúncios de aluguel no DF. Usa curl_cffi para bypass de TLS.
Uso: python scripts/dfimoveis_sync.py [--tipo aluguel|venda] [--cidade todos|brasilia|...] [--paginas N]
"""
import os, re, json, time, random, logging, argparse
from datetime import datetime, timezone, timedelta
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE_URL    = "https://www.dfimoveis.com.br"
IMPERSONATE = "chrome124"

TIPOS_NEGOCIO = {"venda": "venda", "aluguel": "aluguel", "lancamento": "lancamento"}
TIPOS_IMOVEL  = ("todos", "apartamento", "casa", "casa-condominio", "lote", "sala")
CIDADES_DF    = (
    "todos", "brasilia", "aguas-claras", "jardim-botanico", "sobradinho",
    "vicente-pires", "guara", "taguatinga", "samambaia", "ceilandia",
    "planaltina", "gama", "recanto-das-emas", "riacho-fundo", "santa-maria",
    "sao-sebastiao", "nucleo-bandeirante", "lago-norte", "lago-sul",
    "park-way", "park-sul", "asa-sul", "asa-norte", "sudoeste", "cruzeiro",
    "noroeste", "varjao",
)

TRK_CIDADES = (
    "lago-sul", "park-sul", "park-way", "asa-sul", "asa-norte",
    "jardim-botanico", "lago-norte", "sudoeste", "noroeste",
)

BAIRROS_BRASILIA = frozenset({
    "asa-sul", "asa-norte", "noroeste", "sudoeste", "lago-sul", "lago-norte",
    "park-sul", "cruzeiro", "park-way", "varjao", "jardim-botanico",
})

HEADERS = {
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":           "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding":           "gzip, deflate, br",
    "Cache-Control":             "no-cache",
    "Referer":                   "https://www.dfimoveis.com.br/",
    "Sec-Fetch-Dest":            "document",
    "Sec-Fetch-Mode":            "navigate",
    "Sec-Fetch-Site":            "same-origin",
    "Sec-Fetch-User":            "?1",
    "Upgrade-Insecure-Requests": "1",
}

# ── HTTP ──────────────────────────────────────────────────────────────────────

def _session():
    from curl_cffi import requests as curl_requests
    s = curl_requests.Session(impersonate=IMPERSONATE)
    s.headers.update(HEADERS)
    return s

def fetch_page(session, url: str) -> str | None:
    try:
        r = session.get(url, timeout=30)
        if r.status_code == 200:
            return r.text
        if r.status_code == 404:
            return None
        log.warning("Status %d em %s", r.status_code, url)
        return None
    except Exception as e:
        log.warning("Erro GET %s: %s", url, e)
        return None

# ── URL builder ───────────────────────────────────────────────────────────────

def build_url(tipo: str, tipo_imovel: str, cidade: str, pagina: int, ordenamento: str = "mais-recente") -> str:
    # Formato NOVO do site (mudou ~05/2026): /{negocio}/df/{cidade}/{tipo} + bairro na query.
    # As RAs do Plano Piloto (lago-sul, asa-sul, etc.) são BAIRROS de "brasilia".
    tipo_slug   = TIPOS_NEGOCIO.get(tipo, "aluguel")
    imovel_slug = tipo_imovel if tipo_imovel != "todos" else "imoveis"
    params = [f"ordenamento={ordenamento}"]

    if cidade in BAIRROS_BRASILIA:
        path = f"{BASE_URL}/{tipo_slug}/df/brasilia/{imovel_slug}"
        params.insert(0, f"bairro={cidade}")
    elif cidade == "todos":
        path = f"{BASE_URL}/{tipo_slug}/df/todos/{imovel_slug}"
    else:
        path = f"{BASE_URL}/{tipo_slug}/df/{cidade}/{imovel_slug}"

    if pagina > 1:
        params.append(f"pagina={pagina}")
    return path + "?" + "&".join(params)

# ── Parser ────────────────────────────────────────────────────────────────────

_TIPO_IMOVEL_MAP = {
    "apartamento":    "apartamento",
    "casa-condominio":"casa-condominio",
    "casa":           "casa",
    "lote":           "lote",
    "terreno":        "lote",
    "sala":           "sala",
    "galpao":         "galpao",
    "galpão":         "galpao",
}

def clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw))
    if digits.startswith("55") and len(digits) in (12, 13):
        digits = digits[2:]
    if len(digits) not in (10, 11):
        return ""
    area = int(digits[:2])
    if area > 99:
        return ""
    cut = 6 if len(digits) == 10 else 7
    return f"({digits[:2]}) {digits[2:cut]}-{digits[cut:]}"

def extract_price(card) -> str | None:
    for p in card.find_all("p"):
        t = p.get_text(" ", strip=True)
        if t.startswith("R$"):
            strong = p.find("strong")
            if strong:
                return "R$ " + strong.get_text(" ", strip=True).replace("R$ ", "").replace(",", ".")
            price_m = re.search(r"R\$\s*([\d.,]+|Sob Consulta)", t)
            if price_m:
                return "R$ " + price_m.group(1).replace(",", ".")
    return None

def extract_details(card) -> dict:
    details = {"area": None, "quartos": None, "suites": None, "vagas": None, "banheiros": None}
    for div in card.find_all("div"):
        t = div.get_text(" ", strip=True)
        if not t or len(t) > 50:
            continue
        t_low = t.lower()
        if "m²" in t_low or "m2" in t_low:
            details["area"] = t
        elif re.search(r"\d+\s*quarto", t_low):
            details["quartos"] = re.search(r"\d+", t_low).group()
        elif re.search(r"\d+\s*su[íi]te", t_low):
            details["suites"] = re.search(r"\d+", t_low).group()
        elif re.search(r"\d+\s*vaga", t_low):
            details["vagas"] = re.search(r"\d+", t_low).group()
        elif re.search(r"\d+\s*banheir", t_low):
            details["banheiros"] = re.search(r"\d+", t_low).group()
    return details

def extract_images_detail(detail_html: str) -> list[str]:
    """Extrai todas as URLs de fotos da página de detalhe via .swiper-slide img."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(detail_html, "html.parser")
    seen: set[str] = set()
    urls: list[str] = []
    for img in soup.select(".swiper-slide img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src") or ""
        if "dfimoveis.com.br/fotos" in src and src not in seen:
            seen.add(src)
            urls.append(src)
    return urls


def parse_card(card, cidade: str, tipo: str, detail_html: str | None = None) -> dict | None:
    try:
        from urllib.parse import urljoin
        a = card if card.name == "a" else card.find("a")
        href = a.get("href", "") if a else ""
        if not href:
            return None
        link = urljoin(BASE_URL, href) if not href.startswith("http") else href

        h2 = card.find("h2")
        titulo = h2.get_text(" ", strip=True) if h2 else ""
        if not titulo:
            h3 = card.find("h3")
            titulo = h3.get_text(" ", strip=True) if h3 else ""

        preco    = extract_price(card)
        details  = extract_details(card)

        # Thumbnail da listagem (fallback se não tiver detalhe)
        img = card.select_one("picture img") or card.find("img")
        thumbnail = (img.get("src") or img.get("data-src") or "") if img else ""
        if not thumbnail.startswith("http"):
            thumbnail = None

        # Todas as fotos da página de detalhe (quando disponível)
        if detail_html:
            all_imgs = extract_images_detail(detail_html)
            if all_imgs:
                imagens_str = ",".join(all_imgs[:30])
            else:
                imagens_str = thumbnail
        else:
            imagens_str = thumbnail

        tipo_imovel = None
        for key, val in _TIPO_IMOVEL_MAP.items():
            if key in link.lower():
                tipo_imovel = val
                break

        parts = link.rstrip("/").split("/")
        id_anuncio = parts[-1] if parts else None

        badge_span = card.find("span", string=lambda s: s in ("Lançamento", "Destaque", "Novo") if s else False)
        tipo_card = badge_span.get_text(strip=True) if badge_span else None

        creci = None
        card_text = card.get_text(" ", strip=True)
        creci_m = re.search(r"Creci:\s*(\d+)", card_text)
        if creci_m:
            creci = creci_m.group(1)

        # link novo é /imovel/{slug}; o endereço vem no título: "Endereço, BAIRRO, CIDADE"
        bairro = cidade.replace("-", " ").title() if cidade != "todos" else "DF"
        if titulo and "," in titulo:
            tp = [p.strip() for p in titulo.split(",") if p.strip()]
            if tp:
                bairro = tp[0]

        area_raw = details.get("area") or ""
        area_m2 = None
        area_m = re.search(r"([\d.,]+)\s*m[²2]", area_raw)
        if area_m:
            area_m2 = area_m.group(1).replace(",", ".")

        return {
            "link":             link,
            "id_anuncio":       id_anuncio,
            "titulo":           titulo[:200] or "Imóvel",
            "preco":            preco,
            "area_m2":          area_m2,
            "quartos":          details.get("quartos"),
            "suites":           details.get("suites"),
            "vagas":            details.get("vagas"),
            "banheiros":        details.get("banheiros"),
            "tipo_imovel":      tipo_imovel,
            "tipo":             tipo,
            "bairro":           bairro,
            "cidade":           cidade.replace("-", " ").title() if cidade != "todos" else "Brasília",
            "estado":           "DF",
            "descricao":        None,
            "telefone":         None,
            "nome_anunciante":  None,
            "tipo_anunciante":  None,
            "creci":            creci,
            "imagens":          imagens_str,
            "dados_brutos":     json.dumps({"badge": tipo_card, "creci": creci}, ensure_ascii=False),
        }
    except Exception as e:
        log.debug("Erro ao parsear card: %s", e)
        return None

def parse_listings(html: str, cidade: str, tipo: str) -> list[dict]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("a.imovel-card") or soup.select(".imovel-card")
    if not cards:
        html_lower = html.lower()
        if "captcha" in html_lower or "blocked" in html_lower:
            log.warning("[DFImóveis] Possível bloqueio detectado")
        else:
            log.warning("[DFImóveis] Nenhum card encontrado (HTML: %d bytes)", len(html))
    results = []
    for card in cards:
        p = parse_card(card, cidade, tipo)
        if p:
            results.append(p)
    return results

def get_max_page(html: str) -> int:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    links = soup.select("a[href*='pagina=']")
    max_p = 1
    for a in links:
        m = re.search(r"pagina=(\d+)", a.get("href", ""))
        if m:
            max_p = max(max_p, int(m.group(1)))
    spans = soup.find_all("span")
    for span in spans:
        t = span.get_text(strip=True)
        if t.isdigit():
            max_p = max(max_p, min(int(t), 500))
    return max_p

# ── Collect ───────────────────────────────────────────────────────────────────

def scrape_cidade(session, tipo: str, tipo_imovel: str, cidade: str, max_paginas: int, publicados_ha: int) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    cutoff = None
    if publicados_ha > 0:
        cutoff = (datetime.now() - timedelta(days=publicados_ha)).strftime("%Y-%m-%d")

    for pagina in range(1, max_paginas + 1):
        url = build_url(tipo, tipo_imovel, cidade, pagina)
        log.info("[DFImóveis] %s pág %d/%d — %s", cidade, pagina, max_paginas, url)

        html = fetch_page(session, url)
        if not html:
            log.warning("[DFImóveis] Sem resposta em %s pág %d — encerrando", cidade, pagina)
            break

        items = parse_listings(html, cidade, tipo)
        if not items:
            log.info("[DFImóveis] Sem imóveis em %s pág %d — encerrando", cidade, pagina)
            break

        new_items = [i for i in items if i["link"] not in seen]
        for i in new_items:
            seen.add(i["link"])

        # Para os cards novos: rebusca a página de detalhe para pegar todas as fotos
        # (a listagem só tem 1 thumbnail; o detalhe tem até 30 via .swiper-slide img)
        enriched = []
        for item in new_items:
            from bs4 import BeautifulSoup
            card_html = fetch_page(session, item["link"])
            if card_html:
                detail_imgs = extract_images_detail(card_html)
                if detail_imgs:
                    item["imagens"] = ",".join(detail_imgs[:30])
            enriched.append(item)
            time.sleep(random.uniform(0.15, 0.35))

        results.extend(enriched)
        log.info("[DFImóveis] %s pág %d: %d novos (total: %d)", cidade, pagina, len(enriched), len(results))

        time.sleep(random.uniform(1.5, 3.0))

    return results

# ── Upsert ────────────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO imoveis_dfimoveis (
  link, id_anuncio, titulo, preco, area_m2, quartos, suites, vagas, banheiros,
  tipo_imovel, tipo, bairro, cidade, estado, descricao,
  telefone, nome_anunciante, tipo_anunciante, creci,
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
  descricao       = EXCLUDED.descricao,
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
        r["link"], r.get("id_anuncio"), r.get("titulo"),
        r.get("preco"), r.get("area_m2"),
        r.get("quartos"), r.get("suites"), r.get("vagas"), r.get("banheiros"),
        r.get("tipo_imovel"), r.get("tipo"),
        r.get("bairro"), r.get("cidade", "Brasília"), r.get("estado", "DF"),
        r.get("descricao"),
        r.get("telefone"), r.get("nome_anunciante"), r.get("tipo_anunciante"), r.get("creci"),
        r.get("imagens"),
        r.get("dados_brutos"),
        now, now, True,
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("[DB] %d inseridos na tabela imoveis_dfimoveis.", len(values))

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="DFImóveis scraper")
    ap.add_argument("--tipo",         default="aluguel", choices=list(TIPOS_NEGOCIO))
    ap.add_argument("--tipo-imovel",  default="todos",   choices=list(TIPOS_IMOVEL))
    ap.add_argument("--cidade",       default=None,      help="Cidade ou 'trk' para preset TRK")
    ap.add_argument("--paginas",      type=int, default=20)
    ap.add_argument("--publicados-ha",type=int, default=1, dest="publicados_ha")
    args = ap.parse_args()

    if args.cidade == "trk" or args.cidade is None:
        cidades = list(TRK_CIDADES)
    elif args.cidade in CIDADES_DF:
        cidades = [args.cidade]
    else:
        log.error("Cidade '%s' inválida. Use: %s", args.cidade, ", ".join(CIDADES_DF))
        return

    session = _session()
    conn    = psycopg2.connect(os.environ["DATABASE_URL"])
    total   = 0

    for i, cidade in enumerate(cidades, 1):
        log.info("=== [%d/%d] DFImóveis: %s ===", i, len(cidades), cidade)
        rows = scrape_cidade(session, args.tipo, args.tipo_imovel, cidade, args.paginas, args.publicados_ha)
        if rows:
            upsert(conn, rows)
            total += len(rows)
        if i < len(cidades):
            time.sleep(2.0)

    log.info("Concluído — %d anúncios salvos", total)
    conn.close()

if __name__ == "__main__":
    main()
