"""
Backfill de imagens: busca a página de detalhe dos imóveis DFImóveis
que foram coletados com apenas 1 foto e atualiza o campo `imagens`.

Uso:
    python scripts/dfimoveis_backfill_images.py           # executa
    python scripts/dfimoveis_backfill_images.py --dry-run # só imprime o que faria
"""
import os, re, sys, time, random, logging, argparse
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backfill")

# ── DB ────────────────────────────────────────────────────────────────────────

def get_db_url():
    env = Path(__file__).parent.parent / ".env.local"
    for line in env.read_text("utf-8", "replace").splitlines():
        m = re.match(r"^\s*DATABASE_URL\s*=\s*(.+)$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL não encontrada em .env.local")

# ── Candidatos ────────────────────────────────────────────────────────────────

FETCH_SQL = """
    SELECT id, link, imagens
    FROM imoveis_dfimoveis
    WHERE ativo = true
      AND link IS NOT NULL
      AND (
          imagens IS NULL
          OR imagens NOT LIKE '%,%'
      )
    ORDER BY coletado_em DESC
"""

UPDATE_SQL = """
    UPDATE imoveis_dfimoveis
    SET imagens = %s, atualizado_em = NOW()
    WHERE id = %s
"""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Não grava no banco")
    ap.add_argument("--limit", type=int, default=0, help="Máximo de registros (0 = todos)")
    args = ap.parse_args()

    import psycopg2
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from dfimoveis_sync import _session, fetch_page, extract_images_detail

    conn = psycopg2.connect(get_db_url())
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute(FETCH_SQL)
    rows = cur.fetchall()
    if args.limit:
        rows = rows[: args.limit]

    log.info("Candidatos a backfill: %d imóveis", len(rows))
    if not rows:
        log.info("Nada a fazer.")
        return

    session   = _session()
    updated   = 0
    skipped   = 0
    errors    = 0
    batch_size = 50

    for idx, (rid, link, old_imgs) in enumerate(rows, 1):
        try:
            html = fetch_page(session, link)
            if not html:
                log.warning("[%d/%d] Sem resposta: %s", idx, len(rows), link)
                errors += 1
                time.sleep(random.uniform(1.0, 2.0))
                continue

            imgs = extract_images_detail(html)
            if not imgs:
                log.debug("[%d/%d] Sem fotos no detalhe: %s", idx, len(rows), link)
                skipped += 1
                time.sleep(random.uniform(0.4, 0.8))
                continue

            new_imgs = ",".join(imgs[:30])
            if new_imgs == (old_imgs or ""):
                skipped += 1
                time.sleep(random.uniform(0.3, 0.6))
                continue

            if args.dry_run:
                log.info("[DRY] id=%s  fotos=%d  %s", rid, len(imgs), link[:70])
            else:
                cur.execute(UPDATE_SQL, (new_imgs, rid))
                if idx % batch_size == 0:
                    conn.commit()
                    log.info("[%d/%d] commit parcial (%d atualizados até agora)", idx, len(rows), updated + 1)

            updated += 1

        except Exception as e:
            log.warning("[%d/%d] Erro em %s: %s", idx, len(rows), link, e)
            errors += 1

        if idx % 10 == 0:
            log.info("[%d/%d] progresso — atualizados=%d  pulados=%d  erros=%d",
                     idx, len(rows), updated, skipped, errors)

        time.sleep(random.uniform(0.6, 1.3))

    if not args.dry_run:
        conn.commit()

    conn.close()
    log.info("Concluído — atualizados=%d  pulados=%d  erros=%d  total=%d",
             updated, skipped, errors, len(rows))


if __name__ == "__main__":
    main()
