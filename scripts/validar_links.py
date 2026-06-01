"""
Validação de links: verifica se cada anúncio ainda está no ar.
Marca ativo=false nos que retornam 404/410. Ignora erros de rede (temporários).

Uso:
  python scripts/validar_links.py              # valida todos os pendentes
  python scripts/validar_links.py --limite 500 # máx 500 links por execução
  python scripts/validar_links.py --tabela imoveis_olx
"""
import os, sys, time, argparse
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

import psycopg2
import psycopg2.extras
from curl_cffi import requests as curl_requests

# ── Configuração ───────────────────────────────────────────────────────────────

TABELAS = {
    "imoveis_olx":         {"validado_em": True},
    "imoveis_dfimoveis":   {"validado_em": True},
    "imoveis_vivareal":    {"validado_em": False},
    "imoveis_zap":         {"validado_em": False},
    "imoveis_chavesnamao": {"validado_em": False},
    "imoveis_wimoveis":    {"validado_em": True},
    "imoveis_facebook":    {"validado_em": True},
}

WORKERS      = 8      # requisições concorrentes
TIMEOUT      = 12     # segundos por request
DELAY_DOMINIO = 0.3   # delay entre requests do mesmo domínio

# Status HTTP que confirmam anúncio removido
INATIVOS_HTTP = {404, 410, 451}

# ── HTTP ───────────────────────────────────────────────────────────────────────

session = curl_requests.Session(impersonate="chrome124")

def checar_link(link: str) -> str:
    """
    Retorna: 'ativo' | 'inativo' | 'skip'
      - inativo: 404/410 definitivo
      - skip:    erro de rede ou status ambíguo (não toca no registro)
    """
    try:
        r = session.head(link, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code in INATIVOS_HTTP:
            return "inativo"
        # OLX redireciona anúncios expirados para a raiz sem path útil
        if r.status_code in (301, 302):
            loc = r.headers.get("location", "")
            if loc.rstrip("/") in (
                "https://www.olx.com.br",
                "https://www.vivareal.com.br",
                "https://www.zapimoveis.com.br",
                "https://www.chavesnamao.com.br",
            ):
                return "inativo"
        if r.status_code == 200:
            return "ativo"
        # HEAD bloqueado por alguns servidores — tenta GET parcial
        if r.status_code in (405, 403):
            r2 = session.get(link, timeout=TIMEOUT, allow_redirects=True,
                             headers={"Range": "bytes=0-0"})
            if r2.status_code in INATIVOS_HTTP:
                return "inativo"
            if r2.status_code in (200, 206):
                return "ativo"
        return "skip"
    except Exception:
        return "skip"

# ── Banco ──────────────────────────────────────────────────────────────────────

def conectar():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("[ERRO] DATABASE_URL não definida.")
        sys.exit(1)
    return psycopg2.connect(url)

def buscar_links(conn, tabela: str, limite: int) -> list[str]:
    """Prioriza links nunca validados, depois os validados há mais tempo."""
    tem_validado_em = TABELAS[tabela]["validado_em"]
    order_col = "validado_em" if tem_validado_em else "atualizado_em"
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT link FROM {tabela}
            WHERE ativo IS NOT FALSE
            ORDER BY {order_col} ASC NULLS FIRST
            LIMIT %s
        """, (limite,))
        return [r[0] for r in cur.fetchall()]

def atualizar_inativos(conn, tabela: str, links: list[str]):
    if not links:
        return
    tem_validado_em = TABELAS[tabela]["validado_em"]
    now = datetime.now(timezone.utc).isoformat()
    set_clause = "ativo = false, atualizado_em = %s"
    if tem_validado_em:
        set_clause += ", validado_em = %s"
        params = [now, now]
    else:
        params = [now]
    params.append(tuple(links))
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {tabela} SET {set_clause} WHERE link = ANY(%s)",
            params,
        )
    conn.commit()

def atualizar_ativos(conn, tabela: str, links: list[str]):
    """Atualiza validado_em nos que confirmamos como ativos."""
    if not links or not TABELAS[tabela]["validado_em"]:
        return
    now = datetime.now(timezone.utc).isoformat()
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {tabela} SET validado_em = %s WHERE link = ANY(%s)",
            (now, list(links)),
        )
    conn.commit()

# ── Main ───────────────────────────────────────────────────────────────────────

def validar_tabela(conn, tabela: str, limite_por_tabela: int):
    links = buscar_links(conn, tabela, limite_por_tabela)
    if not links:
        print(f"[{tabela}] nenhum link para validar.")
        return

    print(f"[{tabela}] validando {len(links)} links ({WORKERS} workers)...")

    # Agrupa por domínio para throttle
    from urllib.parse import urlparse
    dominio_last = defaultdict(float)

    resultados: dict[str, str] = {}

    def tarefa(link):
        dom = urlparse(link).netloc
        wait = DELAY_DOMINIO - (time.time() - dominio_last[dom])
        if wait > 0:
            time.sleep(wait)
        dominio_last[dom] = time.time()
        return link, checar_link(link)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futuros = {pool.submit(tarefa, lnk): lnk for lnk in links}
        for fut in as_completed(futuros):
            link, status = fut.result()
            resultados[link] = status

    inativos = [l for l, s in resultados.items() if s == "inativo"]
    ativos   = [l for l, s in resultados.items() if s == "ativo"]
    skips    = sum(1 for s in resultados.values() if s == "skip")

    print(f"[{tabela}] ativos={len(ativos)} inativos={len(inativos)} skip={skips}")

    atualizar_inativos(conn, tabela, inativos)
    atualizar_ativos(conn, tabela, ativos)

    return len(inativos)

def main():
    parser = argparse.ArgumentParser(description="Valida links de imóveis no banco")
    parser.add_argument("--tabela",  default=None, help="Validar só uma tabela")
    parser.add_argument("--limite",  type=int, default=300,
                        help="Máx links por tabela (default 300)")
    args = parser.parse_args()

    tabelas = [args.tabela] if args.tabela else list(TABELAS.keys())
    conn = conectar()

    total_inativos = 0
    for tabela in tabelas:
        if tabela not in TABELAS:
            print(f"[ERRO] tabela '{tabela}' desconhecida.")
            continue
        n = validar_tabela(conn, tabela, args.limite)
        if n:
            total_inativos += n

    conn.close()
    print(f"\n[OK] Total marcados inativos: {total_inativos}")

if __name__ == "__main__":
    main()
