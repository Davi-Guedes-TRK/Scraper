"""
Scraper: olx.com.br → Supabase (tabela imoveis_olx)
Coleta anúncios de aluguel no DF. Usa curl_cffi para bypass de TLS.
Uso: python scripts/olx_sync.py [--tipo aluguel|venda] [--paginas N]
"""
import os, re, json, time, random, logging, argparse
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE_URL   = "https://www.olx.com.br/imoveis"
ESTADO_SLUG = "estado-df"
IMPERSONATE = "chrome124"

HEADERS = {
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":           "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding":           "gzip, deflate, br",
    "Cache-Control":             "no-cache",
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
    base = f"{BASE_URL}/{ESTADO_SLUG}"
    parts = ["sp=1"] if tipo == "aluguel" else []
    if pagina > 1:
        parts.append(f"o={pagina}")
    sep = "?" if parts else ""
    return base + sep + "&".join(parts)

# ── Parser ────────────────────────────────────────────────────────────────────

def extract_next_data(html: str) -> dict | None:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("script", id="__NEXT_DATA__")
    if tag and tag.string:
        try:
            return json.loads(tag.string)
        except Exception:
            pass
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return None

def find_ads_recursive(data, depth=0):
    if depth > 10:
        return []
    if isinstance(data, list):
        if len(data) > 0 and any(k in (data[0] if isinstance(data[0], dict) else {}) for k in ("subject", "title", "listId")):
            return data
        for item in data:
            r = find_ads_recursive(item, depth + 1)
            if r:
                return r
    elif isinstance(data, dict):
        for key in ("ads", "adList", "results", "listings"):
            if key in data and isinstance(data[key], list) and len(data[key]) > 0:
                r = find_ads_recursive(data[key], depth + 1)
                if r:
                    return r
        for v in data.values():
            r = find_ads_recursive(v, depth + 1)
            if r:
                return r
    return []

def clean_phone(raw: str) -> str:
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
    try:
        list_id = ad.get("listId") or ad.get("advertisingId")
        titulo  = ad.get("subject") or ad.get("title") or ""
        if not titulo or not list_id:
            return None

        price_obj = ad.get("price") or {}
        preco = price_obj.get("value") or price_obj.get("formattedValue") if isinstance(price_obj, dict) else str(price_obj)

        loc  = ad.get("location") or {}
        bairro    = loc.get("neighbourhood") or ""
        cidade    = loc.get("municipality") or "Brasília"
        estado    = loc.get("uf") or "DF"
        link_raw  = ad.get("url") or ad.get("friendlyUrl") or ""
        link      = link_raw if link_raw.startswith("http") else f"https://www.olx.com.br{link_raw}"

        props = ad.get("properties") or []
        area_m2 = quartos = vagas = suites = banheiros = tipo_imovel = None
        for prop in props:
            name  = (prop.get("name") or "").lower()
            label = (prop.get("label") or "").lower()
            value = prop.get("value") or ""
            if name in ("size", "area", "useful_area"):
                area_m2 = str(value)
            elif name in ("rooms", "bedrooms") or "quarto" in label:
                quartos = str(value)
            elif "suite" in name or "suite" in label:
                suites = str(value)
            elif "garage" in name or "parking" in name or "vaga" in label:
                vagas = str(value)
            elif "bath" in name or "banheiro" in label:
                banheiros = str(value)
            elif name in ("real_estate_type", "property_type") or "tipo" in label:
                tipo_imovel = str(value)

        imgs = ad.get("images") or []
        imagens = [i.get("original") or i.get("thumbnail") or "" for i in imgs if isinstance(i, dict)]
        imagens = [u for u in imagens if u]

        user = ad.get("user") or {}
        nome_anunciante = user.get("name") or ""
        tipo_an_raw     = (user.get("accountType") or user.get("type") or "").lower()
        tipo_anunciante = re.sub(r"[^a-z0-9]", "_", tipo_an_raw) if tipo_an_raw else None

        pub_date = ad.get("publishDate") or ad.get("listTime") or ""
        if re.match(r"^\d{10,}$", str(pub_date)):
            try:
                pub_date = datetime.fromtimestamp(int(pub_date)).strftime("%Y-%m-%d")
            except Exception:
                pub_date = None
        else:
            pub_date = str(pub_date)[:10] or None

        return {
            "link":             link,
            "id_anuncio":       str(list_id),
            "titulo":           titulo[:200],
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
            "estado":           estado.upper() if estado else "DF",
            "descricao":        (ad.get("body") or ad.get("description") or "")[:2000] or None,
            "telefone":         None,
            "nome_anunciante":  nome_anunciante or None,
            "tipo_anunciante":  tipo_anunciante,
            "creci":            None,
            "imagens":          ",".join(imagens[:20]) if imagens else None,
            "data_publicacao":  pub_date,
            "dados_brutos":     json.dumps(ad, ensure_ascii=False, default=str)[:4000],
        }
    except Exception as e:
        log.debug("Erro ao parsear ad: %s", e)
        return None

# ── Collect ───────────────────────────────────────────────────────────────────

def scrape(tipo: str, max_paginas: int, publicados_ha: int = 1) -> list[dict]:
    session  = _session()
    results  = []
    seen_ids: set[str] = set()

    cutoff = None
    if publicados_ha > 0:
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=publicados_ha)).strftime("%Y-%m-%d")

    for pagina in range(1, max_paginas + 1):
        url = build_url(tipo, pagina)
        log.info("[OLX] Página %d/%d — %s", pagina, max_paginas, url)

        html = fetch_page(session, url)
        if not html:
            log.warning("[OLX] Sem resposta na página %d — encerrando", pagina)
            break

        next_data = extract_next_data(html)
        if not next_data:
            log.warning("[OLX] __NEXT_DATA__ não encontrado na página %d", pagina)
            break

        ads = find_ads_recursive(next_data)
        if not ads:
            log.warning("[OLX] Nenhum anúncio na página %d — encerrando", pagina)
            break

        page_items = []
        stop_early = False
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
        log.info("[OLX] Página %d: %d anúncios (total: %d)", pagina, len(page_items), len(results))

        if stop_early:
            log.info("[OLX] Parada antecipada — anúncio anterior a %s encontrado", cutoff)
            break

        time.sleep(random.uniform(2.0, 4.0))

    return results

# ── Upsert ────────────────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO imoveis_olx (
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
    log.info("[DB] %d inseridos na tabela imoveis_olx.", len(values))

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="OLX scraper — DF aluguel")
    ap.add_argument("--tipo",      default="aluguel", choices=["aluguel", "venda"])
    ap.add_argument("--paginas",   type=int, default=20)
    ap.add_argument("--publicados-ha", type=int, default=1, dest="publicados_ha")
    args = ap.parse_args()

    rows = scrape(args.tipo, args.paginas, args.publicados_ha)
    log.info("[OLX] Total coletado: %d anúncios", len(rows))
    if not rows:
        log.info("[OLX] Nenhum resultado — encerrando sem gravar.")
        return

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    upsert(conn, rows)
    conn.close()

if __name__ == "__main__":
    main()
