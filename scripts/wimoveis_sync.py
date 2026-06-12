"""
Scraper: wimoveis.com.br → Supabase (tabela imoveis_wimoveis)
Coleta anúncios de aluguel no DF. Usa curl_cffi para bypass de TLS.
Extrai __NEXT_DATA__ JSON embutido na página (padrão Next.js).

Uso: python scripts/wimoveis_sync.py [--tipo aluguel|venda] [--paginas N] [--publicados-ha N]
"""
import os, re, json, time, random, logging, argparse
from datetime import datetime, timezone, timedelta
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE_URL    = "https://www.wimoveis.com.br"
IMPERSONATE = "chrome124"

HEADERS = {
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":           "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding":           "gzip, deflate, br",
    "Cache-Control":             "no-cache",
    "Referer":                   "https://www.wimoveis.com.br/",
    "Sec-Fetch-Dest":            "document",
    "Sec-Fetch-Mode":            "navigate",
    "Sec-Fetch-Site":            "none",
    "Sec-Fetch-User":            "?1",
    "Upgrade-Insecure-Requests": "1",
}

# ── HTTP ──────────────────────────────────────────────────────────────────────

def _session():
    from curl_cffi import requests as curl_requests
    s = curl_requests.Session(impersonate=IMPERSONATE)
    return s

def fetch_page(session, url: str) -> str | None:
    try:
        r = session.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 200:
            return r.text
        log.warning("Status %d em %s", r.status_code, url)
        return None
    except Exception as e:
        log.warning("Erro GET %s: %s", url, e)
        return None

# ── URL builder ───────────────────────────────────────────────────────────────

def build_url(tipo: str, pagina: int) -> str:
    # Wimoveis: /imoveis/aluguel/distrito-federal/ ou /imoveis/venda/distrito-federal/
    negocio = "aluguel" if tipo == "aluguel" else "venda"
    url = f"{BASE_URL}/imoveis/{negocio}/distrito-federal/"
    if pagina > 1:
        url += f"?pagina={pagina}"
    return url

# ── Parser ────────────────────────────────────────────────────────────────────

def extract_next_data(html: str) -> dict | None:
    # Tenta __NEXT_DATA__ (Next.js padrão)
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("script", id="__NEXT_DATA__")
    if tag and tag.string:
        try:
            return json.loads(tag.string)
        except Exception:
            pass

    # Fallback: __PRELOADED_STATE__ (alguns sites Navent)
    m2 = re.search(r'window\.__PRELOADED_STATE__\s*=\s*({.*?});\s*</script>', html, re.DOTALL)
    if m2:
        try:
            return json.loads(m2.group(1))
        except Exception:
            pass

    return None

def _find_listings(data, depth=0):
    if depth > 12:
        return []
    if isinstance(data, list) and len(data) > 0:
        first = data[0] if isinstance(data[0], dict) else {}
        # Detects both OLX-style and Properati/Navent-style listing arrays
        if any(k in first for k in ("subject", "title", "listId", "id", "url", "listing")):
            return data
        for item in data:
            r = _find_listings(item, depth + 1)
            if r:
                return r
    elif isinstance(data, dict):
        for key in ("ads", "adList", "results", "listings", "items", "propertyList", "props"):
            if key in data and isinstance(data[key], list) and len(data[key]) > 0:
                r = _find_listings(data[key], depth + 1)
                if r:
                    return r
        for v in data.values():
            r = _find_listings(v, depth + 1)
            if r:
                return r
    return []

def _clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw))
    if digits.startswith("55") and len(digits) in (12, 13):
        digits = digits[2:]
    if len(digits) not in (10, 11):
        return ""
    area = int(digits[:2])
    if area > 99:
        return ""
    fmt = f"({digits[:2]}) {digits[2:6 if len(digits)==10 else 7]}-{digits[6 if len(digits)==10 else 7:]}"
    return fmt

def parse_ad(ad: dict, tipo: str) -> dict | None:
    """Parseia um item de listagem. Suporta formato OLX e formato Properati."""
    try:
        # Suporte a formato aninhado {"listing": {...}, "account": {...}}
        account = {}
        if "listing" in ad and isinstance(ad["listing"], dict):
            account = ad.get("account", {})
            ad = ad["listing"]

        ad_id    = (ad.get("listId") or ad.get("id") or ad.get("externalId") or
                    ad.get("legacyId") or ad.get("providerId"))
        titulo   = ad.get("subject") or ad.get("title") or ad.get("description", "")[:80]
        if not titulo or not ad_id:
            return None

        # Link
        link_raw = ad.get("url") or ad.get("friendlyUrl") or ad.get("permalink") or ""
        if link_raw.startswith("http"):
            link = link_raw
        elif link_raw:
            link = f"{BASE_URL}{link_raw}"
        else:
            link = f"{BASE_URL}/imovel/{ad_id}/"

        # Preço
        preco = None
        price_obj = ad.get("price") or ad.get("pricingInfos")
        if isinstance(price_obj, dict):
            preco = price_obj.get("rentalTotalPrice") or price_obj.get("price") or price_obj.get("value") or price_obj.get("formattedValue")
        elif isinstance(price_obj, list) and len(price_obj) > 0:
            pi = price_obj[0]
            preco = pi.get("price") or pi.get("rentalTotalPrice")
        elif price_obj:
            preco = str(price_obj)

        # Localização
        loc = ad.get("address") or ad.get("locationDetails") or {}
        if isinstance(loc, str):
            loc = {}
        bairro = loc.get("neighborhood") or loc.get("neighbourhood") or loc.get("zone") or ""
        cidade = loc.get("city") or loc.get("municipality") or "Brasília"
        estado = (loc.get("stateAcronym") or loc.get("uf") or "DF").upper()

        # Características
        area_m2 = quartos = vagas = suites = banheiros = tipo_imovel = None

        # Formato Properati/ZAP (campos diretos)
        if ad.get("usableAreas"):
            ua = ad["usableAreas"]
            area_m2 = str(ua[0]) if isinstance(ua, list) and ua else str(ua)
        elif ad.get("usableArea"):
            area_m2 = str(ad["usableArea"])

        if ad.get("bedrooms") is not None:
            quartos = str(ad["bedrooms"])
        if ad.get("suites") is not None:
            suites = str(ad["suites"])
        if ad.get("parkingSpaces") is not None:
            vagas = str(ad["parkingSpaces"])
        if ad.get("bathrooms") is not None:
            banheiros = str(ad["bathrooms"])
        if ad.get("propertyType"):
            tipo_imovel = str(ad["propertyType"])
        if ad.get("unitTypes"):
            ut = ad["unitTypes"]
            tipo_imovel = ut[0] if isinstance(ut, list) and ut else str(ut)

        # Formato OLX (array de properties)
        for prop in (ad.get("properties") or []):
            name  = (prop.get("name") or "").lower()
            label = (prop.get("label") or "").lower()
            value = prop.get("value") or ""
            if name in ("size", "area", "useful_area") and not area_m2:
                area_m2 = str(value)
            elif (name in ("rooms", "bedrooms") or "quarto" in label) and not quartos:
                quartos = str(value)
            elif ("suite" in name or "suite" in label) and not suites:
                suites = str(value)
            elif ("garage" in name or "parking" in name or "vaga" in label) and not vagas:
                vagas = str(value)
            elif ("bath" in name or "banheiro" in label) and not banheiros:
                banheiros = str(value)
            elif (name in ("real_estate_type", "property_type") or "tipo" in label) and not tipo_imovel:
                tipo_imovel = str(value)

        # Imagens
        imgs = ad.get("images") or ad.get("photos") or []
        imagens = []
        for i in imgs:
            if isinstance(i, dict):
                url_img = i.get("original") or i.get("url") or i.get("src") or ""
            else:
                url_img = str(i)
            if url_img:
                imagens.append(url_img)

        # Anunciante
        user = ad.get("user") or account or {}
        nome_anunciante = (user.get("name") or user.get("fullName") or
                           ad.get("advertiserName") or None)
        tipo_an_raw = (user.get("accountType") or user.get("type") or
                       user.get("advertiserType") or "").lower()
        if not tipo_an_raw and ad.get("professionalAd"):
            tipo_an_raw = "profissional"
        tipo_anunciante = re.sub(r"[^a-z0-9]", "_", tipo_an_raw) if tipo_an_raw else None

        phones = user.get("phones") or account.get("phones") or []
        telefone = None
        if phones:
            raw_ph = phones[0] if isinstance(phones[0], str) else (phones[0].get("number") or phones[0].get("phone") or "") if isinstance(phones[0], dict) else ""
            clean = _clean_phone(raw_ph)
            telefone = clean or None

        # Data de publicação
        pub_date = (ad.get("publishDate") or ad.get("listTime") or ad.get("date") or
                    ad.get("createdAt") or ad.get("updatedAt") or "")
        if re.match(r"^\d{10,}$", str(pub_date)):
            try:
                pub_date = datetime.fromtimestamp(int(pub_date)).strftime("%Y-%m-%d")
            except Exception:
                pub_date = None
        else:
            pub_date = str(pub_date)[:10] or None

        return {
            "link":             link,
            "id_anuncio":       str(ad_id),
            "titulo":           str(titulo)[:200],
            "preco":            str(preco) if preco else None,
            "area_m2":          area_m2,
            "quartos":          quartos,
            "suites":           suites,
            "vagas":            vagas,
            "banheiros":        banheiros,
            "tipo_imovel":      tipo_imovel,
            "tipo":             tipo,
            "bairro":           bairro,
            "cidade":           cidade,
            "estado":           estado,
            "descricao":        (ad.get("body") or ad.get("description") or "")[:2000] or None,
            "telefone":         telefone,
            "nome_anunciante":  nome_anunciante,
            "tipo_anunciante":  tipo_anunciante,
            "creci":            None,
            "imagens":          ",".join(imagens[:20]) if imagens else None,
            "data_publicacao":  pub_date,
            "dados_brutos":     json.dumps(
                {k: v for k, v in ad.items() if k not in ("matchingAds", "images", "photos")},
                ensure_ascii=False, default=str,
            )[:5000],
        }
    except Exception as e:
        log.debug("Erro ao parsear ad: %s", e)
        return None

# ── Scrape ────────────────────────────────────────────────────────────────────

def scrape(tipo: str, max_paginas: int, publicados_ha: int = 1) -> list[dict]:
    session  = _session()
    results  = []
    seen_ids: set[str] = set()

    cutoff = None
    if publicados_ha > 0:
        cutoff = (datetime.now() - timedelta(days=publicados_ha)).strftime("%Y-%m-%d")

    for pagina in range(1, max_paginas + 1):
        url = build_url(tipo, pagina)
        log.info("[Wimoveis] Página %d/%d — %s", pagina, max_paginas, url)

        html = fetch_page(session, url)
        if not html:
            log.warning("[Wimoveis] Sem resposta na página %d — encerrando", pagina)
            break

        next_data = extract_next_data(html)
        if not next_data:
            log.warning("[Wimoveis] JSON não encontrado na página %d — verifique a estrutura do site", pagina)
            if pagina == 1:
                # Salva amostra para debug
                with open("/tmp/wimoveis_p1.html", "w", encoding="utf-8") as f:
                    f.write(html[:50000])
                log.info("[Wimoveis] Amostra salva em /tmp/wimoveis_p1.html para debug")
            break

        ads = _find_listings(next_data)
        if not ads:
            log.warning("[Wimoveis] Nenhum anúncio encontrado na página %d", pagina)
            if pagina == 1:
                with open("/tmp/wimoveis_next_data.json", "w", encoding="utf-8") as f:
                    json.dump(next_data, f, ensure_ascii=False, indent=2, default=str)
                log.info("[Wimoveis] next_data salvo em /tmp/wimoveis_next_data.json para debug")
            break

        stop_early = False
        page_items = []
        for ad in ads:
            parsed = parse_ad(ad, tipo)
            if not parsed:
                continue
            if parsed["id_anuncio"] in seen_ids:
                continue
            seen_ids.add(parsed["id_anuncio"])
            if cutoff and (parsed.get("data_publicacao") or "9999") < cutoff:
                stop_early = True
                break
            page_items.append(parsed)

        results.extend(page_items)
        log.info("[Wimoveis] Página %d: %d anúncios (total: %d)", pagina, len(page_items), len(results))

        if stop_early:
            log.info("[Wimoveis] Parada antecipada — anúncio anterior a %s", cutoff)
            break

        time.sleep(random.uniform(2.0, 4.5))

    return results

# ── Upsert ────────────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO imoveis_wimoveis (
  link, id_anuncio, titulo, preco, area_m2, quartos, suites, vagas, banheiros,
  tipo_imovel, tipo, bairro, cidade, estado, descricao,
  telefone, nome_anunciante, tipo_anunciante, creci,
  imagens, data_publicacao, dados_brutos, coletado_em, atualizado_em, ativo
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
        r.get("imagens"), r.get("data_publicacao"),
        r.get("dados_brutos"),
        now, now, True,
    ) for r in rows]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values)
    conn.commit()
    log.info("[DB] %d registros gravados em imoveis_wimoveis.", len(values))

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Wimoveis scraper — DF aluguel")
    ap.add_argument("--tipo",           default="aluguel", choices=["aluguel", "venda"])
    ap.add_argument("--paginas",        type=int, default=20)
    ap.add_argument("--publicados-ha",  type=int, default=1, dest="publicados_ha")
    args = ap.parse_args()

    rows = scrape(args.tipo, args.paginas, args.publicados_ha)
    log.info("[Wimoveis] Total coletado: %d", len(rows))
    if not rows:
        log.info("[Wimoveis] Nenhum resultado — verifique a URL/estrutura do site.")
        return

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    upsert(conn, rows)
    conn.close()

if __name__ == "__main__":
    main()
