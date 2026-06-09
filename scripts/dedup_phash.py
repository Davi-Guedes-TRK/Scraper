"""
Deduplicação de imóveis por pHash de imagem + flag de "sem exclusividade".

Fluxo:
  1. BACKFILL : calcula img_hashes para as linhas que ainda não têm (todas as tabelas).
  2. CLUSTER  : bloqueia por (bairro+tipo+quartos), compara fotos por Hamming,
                e une anúncios que são o mesmo imóvel (union-find).
  3. COLAPSA  : escolhe 1 canônico por grupo, marca os demais ativo=false e grava
                grupo_id / is_canonico / sem_exclusividade / grupo_meta.
                "Sem exclusividade" = o grupo tem >=2 anunciantes DISTINTOS
                (telefone/CRECI/nome) → nenhuma imobiliária tem o lock do imóvel.

SEGURANÇA: sem --apply, roda em DRY-RUN (só imprime o que faria; não escreve).
           --reset desfaz o colapso (reativa não-canônicos e limpa as colunas).

Uso:
  python scripts/dedup_phash.py                      # dry-run completo
  python scripts/dedup_phash.py --apply              # aplica de verdade
  python scripts/dedup_phash.py --backfill-only --apply
  python scripts/dedup_phash.py --cluster-only --apply
  python scripts/dedup_phash.py --reset --apply      # desfaz tudo

Env: DATABASE_URL (mesma usada pelos *_sync.py).
Requer: psycopg2, e (para backfill) Pillow + imagehash + curl_cffi.
"""
from __future__ import annotations
import argparse
import hashlib
import logging
import os
import re
import sys

import psycopg2
from psycopg2.extras import Json, RealDictCursor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phash_util import compute_phashes, best_distance, count_close  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dedup")

TABLES = [
    "imoveis_olx", "imoveis_dfimoveis", "imoveis_wimoveis", "imoveis_facebook",
    "imoveis_vivareal", "imoveis_zap", "imoveis_chavesnamao",
]

# Limiares de match (pHash de 64 bits).
STRONG = 4      # um par de fotos a <=4 bits já basta (quase certo a mesma foto)
THRESHOLD = 8   # >=2 pares a <=8 bits também conta (robustez)

PROPRIETARIO = {"pf", "particular", "proprietario", "proprietário", "pessoa fisica", "pessoa física"}


def portal(table: str) -> str:
    return table.replace("imoveis_", "")


# ── Normalização ────────────────────────────────────────────────────────────────

def norm(s) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def block_key(r: dict) -> str:
    """Anúncios só são comparados dentro do mesmo bloco — evita O(n²) global.

    Usa `cidade` (no OLX e no DFImóveis esse campo guarda o BAIRRO real, ex.
    "Asa Norte" / "asa-norte" → mesmo bloco após norm). NÃO usa `bairro`
    (no OLX é só "Brasília"), nem `tipo_imovel`/`quartos` (grafias divergentes
    entre portais e muitos nulos no DF). Deixa o pHash discriminar dentro do bloco.
    """
    return norm(r.get("cidade")) or norm(r.get("bairro"))


def advertiser(r: dict) -> str | None:
    """Identidade do anunciante para medir exclusividade.

    Ordem creci > nome > telefone DE PROPÓSITO: no DFImóveis o `telefone` é um
    número-proxy único do portal (todos os anúncios compartilham o mesmo), então
    é inútil pra distinguir imobiliária. CRECI/nome é o que identifica a agência.
    """
    creci = norm(r.get("creci"))
    if creci:
        return "creci:" + creci
    nome = (r.get("nome_anunciante") or "").strip().lower()
    if nome:
        return "nome:" + nome
    tel = re.sub(r"\D", "", r.get("telefone") or "")
    return "tel:" + tel[-11:] if len(tel) >= 10 else None


# ── Union-Find ────────────────────────────────────────────────────────────────

class UF:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


# ── Etapas ──────────────────────────────────────────────────────────────────────

def backfill(conn, apply: bool, retry_empty: bool):
    cond = "img_hashes IS NULL" if not retry_empty else "(img_hashes IS NULL OR jsonb_array_length(img_hashes) = 0)"
    total = 0
    for t in TABLES:
        with conn.cursor() as cur:
            cur.execute(f"SELECT link, imagens FROM public.{t} WHERE {cond} AND imagens IS NOT NULL")
            rows = cur.fetchall()
        if not rows:
            continue
        log.info("[backfill] %s: %d linhas sem hash", t, len(rows))
        for i, (link, imagens) in enumerate(rows, 1):
            hashes = compute_phashes(imagens)
            total += 1
            if apply:
                with conn.cursor() as cur:
                    cur.execute(f"UPDATE public.{t} SET img_hashes = %s WHERE link = %s", (Json(hashes), link))
                conn.commit()
            if i % 50 == 0:
                log.info("[backfill] %s: %d/%d", t, i, len(rows))
    log.info("[backfill] processadas %d linhas%s", total, "" if apply else " (DRY-RUN, nada gravado)")


def load_rows(conn) -> list[dict]:
    rows: list[dict] = []
    for t in TABLES:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                SELECT link, telefone, creci, nome_anunciante, tipo_anunciante,
                       bairro, cidade, tipo_imovel, tipo, quartos, img_hashes, coletado_em
                FROM public.{t}
                WHERE img_hashes IS NOT NULL AND jsonb_array_length(img_hashes) > 0
                  AND COALESCE(ativo, true) = true
            """)
            for r in cur.fetchall():
                r = dict(r)
                r["table"] = t
                rows.append(r)
    log.info("[cluster] %d anúncios ativos com hash carregados", len(rows))
    return rows


def is_match(a: dict, b: dict) -> bool:
    h_a, h_b = a["img_hashes"], b["img_hashes"]
    d = best_distance(h_a, h_b)
    if d <= STRONG:
        return True
    return d <= THRESHOLD and count_close(h_a, h_b, THRESHOLD) >= 2


def cluster(rows: list[dict]) -> list[list[dict]]:
    # bloqueia
    blocks: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        blocks.setdefault(block_key(r), []).append(i)

    uf = UF(len(rows))
    comparacoes = 0
    for idxs in blocks.values():
        for x in range(len(idxs)):
            for y in range(x + 1, len(idxs)):
                comparacoes += 1
                if is_match(rows[idxs[x]], rows[idxs[y]]):
                    uf.union(idxs[x], idxs[y])
    log.info("[cluster] %d comparações em %d blocos", comparacoes, len(blocks))

    grupos: dict[int, list[dict]] = {}
    for i, r in enumerate(rows):
        grupos.setdefault(uf.find(i), []).append(r)
    return [g for g in grupos.values() if len(g) > 1]


def canonical(group: list[dict]) -> dict:
    """Prefere proprietário > mais fotos > coletado primeiro."""
    def rank(r):
        prop = (r.get("tipo_anunciante") or "").lower() in PROPRIETARIO
        return (0 if prop else 1, -len(r["img_hashes"]), str(r.get("coletado_em") or "9999"))
    return sorted(group, key=rank)[0]


def collapse(conn, groups: list[list[dict]], apply: bool):
    n_dups = 0
    n_sem_excl = 0
    for group in groups:
        canon = canonical(group)
        anunciantes = sorted({a for a in (advertiser(r) for r in group) if a})
        sem_excl = len(anunciantes) >= 2
        gid = "g_" + hashlib.md5(canon["link"].encode()).hexdigest()[:12]
        meta = {
            "n": len(group),
            "portais": sorted({portal(r["table"]) for r in group}),
            "anunciantes": anunciantes,
            "sem_exclusividade": sem_excl,
        }
        n_dups += len(group) - 1
        if sem_excl:
            n_sem_excl += 1

        flag = "  ⚑ SEM EXCLUSIVIDADE" if sem_excl else ""
        log.info("[grupo %s] %d anúncios em %s | %d anunciante(s)%s",
                 gid, len(group), ",".join(meta["portais"]), len(anunciantes), flag)
        for r in group:
            tag = "canônico" if r is canon else "colapsa→ativo=false"
            log.info("    - %s [%s] %s", portal(r["table"]), tag, r["link"])

        if apply:
            for r in group:
                is_canon = r is canon
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE public.{r['table']}
                            SET grupo_id = %s,
                                is_canonico = %s,
                                sem_exclusividade = %s,
                                grupo_meta = %s,
                                ativo = CASE WHEN %s THEN ativo ELSE false END
                            WHERE link = %s""",
                        (gid, is_canon, sem_excl, Json(meta) if is_canon else None, is_canon, r["link"]),
                    )
            conn.commit()

    log.info("[colapsa] %d grupos | %d duplicatas colapsadas | %d sem exclusividade%s",
             len(groups), n_dups, n_sem_excl, "" if apply else " (DRY-RUN, nada gravado)")


def reset(conn, apply: bool):
    for t in TABLES:
        if apply:
            with conn.cursor() as cur:
                # reativa só o que ESTE processo desativou (não-canônicos de um grupo)
                cur.execute(f"""UPDATE public.{t}
                                SET ativo = true
                                WHERE grupo_id IS NOT NULL AND COALESCE(is_canonico, false) = false""")
                cur.execute(f"""UPDATE public.{t}
                                SET grupo_id = NULL, is_canonico = false,
                                    sem_exclusividade = NULL, grupo_meta = NULL
                                WHERE grupo_id IS NOT NULL""")
            conn.commit()
    log.info("[reset] colapso desfeito%s", "" if apply else " (DRY-RUN, nada gravado)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="grava no banco (sem isso = dry-run)")
    ap.add_argument("--backfill-only", action="store_true")
    ap.add_argument("--cluster-only", action="store_true")
    ap.add_argument("--reset", action="store_true", help="desfaz o colapso e limpa as colunas")
    ap.add_argument("--retry-empty", action="store_true", help="reprocessa linhas com hash vazio []")
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL não definida")
        sys.exit(1)
    conn = psycopg2.connect(dsn)

    try:
        if args.reset:
            reset(conn, args.apply)
            return
        if not args.cluster_only:
            backfill(conn, args.apply, args.retry_empty)
        if not args.backfill_only:
            rows = load_rows(conn)
            groups = cluster(rows)
            collapse(conn, groups, args.apply)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
