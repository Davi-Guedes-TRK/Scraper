"""
Scraper: vivareal.com.br → Supabase (tabela imoveis_vivareal)
Usa Glue API JSON (sem browser). Fallback: Playwright.
Uso: python scripts/vivareal_sync.py
"""
import os, re, json, time, logging
from datetime import datetime, timezone
import requests
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PORTAL   = "vivareal"
BASE_URL = "https://www.vivareal.com.br"
GLUE_API = "https://glue-api.vivareal.com.br/v2/listings"

HEADERS_API = {
    "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":       "application/json",
    "x-domain":     "www.vivareal.com.br",
    "x-platform":   "WEB",
    "origin":       "https://www.vivareal.com.br",
    "referer":      "https://www.vivareal.com.br/",
}

BAIRROS = [
    "Lago Sul", "Lago Norte", "Asa Sul", "Asa Norte",
    "Noroeste", "Sudoeste", "Park Way", "Park Sul",
]

PAGE_SIZE = 100

# ── Glue API ──────────────────────────────────────────────────────────────────

def fetch_page_api(bairro: str, offset: int) -> dict | None:
    params = {
        "addressNeighborhood": bairro,
        "addressCity":         "Brasília",
        "addressState":        "Distrito Federal",
        "addressCountry":      "Brasil",
        "business":            "RENTAL",
        "unitTypes":           "APARTMENT,HOME,CONDOMINIUM,TWO_STORY_HOUSE",
        "listingType":         "USED",
        "size":                PAGE_SIZE,
        "from":                offset,
        "sort":                "updatedAt desc",
        "fields":              "search",
        "includeFields":       "search(result(listings(listing(displayAddressType,amenities,usableAreas,constructionStatus,listingType,description,title,stamps,createdAt,floors,unitTypes,nonActivationReason,providerId,openDate,propertyType,unitSubTypes,unitsOnTheFloor,legacyId,id,portal,unitFloor,parkingSpaces,updatedAt,address,suites,publicationType,externalId,bathrooms,usableArea,bedrooms,pricingInfos,showPrice,resale,buildings,capacityLimit,status),account(id,name,licenseNumber,showAddress,legacyVivarealId,phones,whatsappNumber)))",
    }
    try:
        r = requests.get(GLUE_API, params=params, headers=HEADERS_API, timeout=20)
        if r.status_code == 200:
            return r.json()
        log.warning("API retornou %d para %s offset %d", r.status_code, bairro, offset)
        return None
    except Exception as e:
        log.warning("Erro API %s offset %d: %s", bairro, offset, e)
        return None

def parse_listing_api(item: dict) -> dict | None:
    listing = item.get("listing", {})
    account = item.get("account", {})

    lid = listing.get("id") or listing.get("legacyId") or listing.get("externalId")
    if not lid:
        return None

    link = f"{BASE_URL}/imovel/{lid}/"

    address = listing.get("address", {})
    bairro  = address.get("neighborhood") or address.get("zone") or ""
    cidade  = address.get("city", "Brasília")
    estado  = address.get("stateAcronym", "DF")
    lat     = address.get("point", {}).get("lat")
    lng     = address.get("point", {}).get("lon")
    endereco_full = " ".join(filter(None, [
        address.get("street"), address.get("streetNumber"),
        address.get("complement"), address.get("neighborhood"),
    ]))

    precos = listing.get("pricingInfos", [])
    preco  = None
    for p in precos:
        if p.get("businessType") == "RENTAL":
            v = p.get("rentalTotalPrice") or p.get("price")
            if v:
                preco = f"R$ {v}"
                break

    areas   = listing.get("usableAreas", [])
    area_m2 = str(areas[0]) if areas else None

    quartos  = str(listing.get("bedrooms", "") or "")
    suites   = str(listing.get("suites", "") or "")
    vagas    = str(listing.get("parkingSpaces", "") or "")
    banheiros = str(listing.get("bathrooms", "") or "")

    tipo_imovel = listing.get("unitTypes", [""])[0] if listing.get("unitTypes") else None
    titulo = listing.get("title", "").strip() or tipo_imovel or "Imóvel"
    descricao = (listing.get("description") or "")[:2000]

    creci = account.get("licenseNumber") or ""
    nome_anunciante = account.get("name") or ""
    fones = account.get("phones", [])
    telefone = fones[0] if fones else None
    tipo_anunciante = "imobiliaria" if creci else "proprietario"

    imagens = []
    for img in listing.get("images", []):
        src = img.get("url") if isinstance(img, dict) else str(img)
        if src:
            imagens.append(src)

    return {
        "link": link, "id_anuncio": str(lid), "titulo": titulo,
        "preco": preco, "area_m2": area_m2,
        "quartos": quartos or None, "suites": suites or None,
        "vagas": vagas or None, "banheiros": banheiros or None,
        "tipo_imovel": tipo_imovel, "tipo": tipo_imovel,
        "bairro": bairro, "cidade": cidade, "estado": estado,
        "endereco": endereco_full or None,
        "descricao": descricao or None,
        "telefone": telefone, "nome_anunciante": nome_anunciante or None,
        "tipo_anunciante": tipo_anunciante, "creci": creci or None,
        "imagens": ",".join(imagens) if imagens else None,
        "lat": lat, "lng": lng,
        "dados_brutos": listing,
    }

# ── Playwright fallback ───────────────────────────────────────────────────────

def fetch_with_playwright(bairro: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.warning("playwright não instalado — pulando fallback")
        return []

    slug = bairro.lower().replace(" ", "-")
    url  = f"{BASE_URL}/aluguel/distrito-federal/brasilia/{slug}/"
    rows = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
            locale="pt-BR",
        )
        ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        page = ctx.new_page()

        for pg in range(1, 11):
            page_url = url if pg == 1 else f"{url}?pagina={pg}"
            try:
                page.goto(page_url, wait_until="networkidle", timeout=30000)
            except Exception as e:
                log.warning("[PW] %s pg %d timeout: %s", bairro, pg, e)
                break

            cards = page.query_selector_all("[data-type='property'],[class*='property-card']")
            if not cards:
                break

            for card in cards:
                try:
                    a = card.query_selector("a[href]")
                    href = a.get_attribute("href") if a else None
                    if not href:
                        continue
                    link = href if href.startswith("http") else f"{BASE_URL}{href}"
                    m = re.search(r"/imovel/(\d+)", link)
                    lid = m.group(1) if m else link

                    titulo_el = card.query_selector("h2,h3,[class*='title']")
                    titulo = titulo_el.inner_text().strip() if titulo_el else "Imóvel"

                    preco_el = card.query_selector("[class*='price'],[class*='preco']")
                    preco = preco_el.inner_text().strip() if preco_el else None

                    rows.append({
                        "link": link, "id_anuncio": lid, "titulo": titulo,
                        "preco": preco, "bairro": bairro,
                        "cidade": "Brasília", "estado": "DF",
                        "dados_brutos": {"source": "playwright"},
                    })
                except Exception:
                    pass

            log.info("[PW] %s pg %d: %d cards", bairro, pg, len(cards))
            time.sleep(2.0)

        browser.close()
    return rows

# ── Collect ───────────────────────────────────────────────────────────────────

def collect_bairro(bairro: str) -> list[dict]:
    rows, offset = [], 0
    while True:
        data = fetch_page_api(bairro, offset)
        if not data:
            break
        listings = (data.get("search", {})
                        .get("result", {})
                        .get("listings", []))
        if not listings:
            break
        for item in listings:
            parsed = parse_listing_api(item)
            if parsed:
                rows.append(parsed)
        log.info("[API] %s offset %d: %d itens", bairro, offset, len(listings))
        if len(listings) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(1.0)

    if not rows:
        log.info("[API] %s sem resultado — tentando Playwright", bairro)
        rows = fetch_with_playwright(bairro)

    return rows

# ── Upsert ────────────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO imoveis_vivareal (
  link, id_anuncio, titulo, preco, area_m2, quartos, suites, vagas, banheiros,
  tipo_imovel, tipo, bairro, cidade, estado, endereco, descricao,
  telefone, nome_anunciante, tipo_anunciante, creci,
  imagens, lat, lng, dados_brutos, coletado_em, atualizado_em, ativo
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
  lat             = EXCLUDED.lat,
  lng             = EXCLUDED.lng,
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
        r.get("endereco"), r.get("descricao"),
        r.get("telefone"), r.get("nome_anunciante"), r.get("tipo_anunciante"), r.get("creci"),
        r.get("imagens"), r.get("lat"), r.get("lng"),
        json.dumps(r.get("dados_brutos") or {}, ensure_ascii=False, default=str),
        now, now, True,
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("Upsert: %d anúncios", len(values))

# ── Main ──────────────────────────────────────────────────────────────────────

def deactivate_missing(conn, bairros_processados: list[str], links_vistos: set[str]):
    if not links_vistos or not bairros_processados:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE imoveis_vivareal
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
        log.info("Desativados (ausentes há 2+ dias): %d anúncios", desativados)

def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    total = 0
    all_links: set[str] = set()
    bairros_ok: list[str] = []

    for bairro in BAIRROS:
        log.info("=== %s ===", bairro)
        rows = collect_bairro(bairro)
        if rows:
            upsert(conn, rows)
            all_links.update(r["link"] for r in rows)
            bairros_ok.append(bairro)
            total += len(rows)
        time.sleep(2.0)

    deactivate_missing(conn, bairros_ok, all_links)
    log.info("Concluído — %d anúncios salvos", total)
    conn.close()

if __name__ == "__main__":
    main()
