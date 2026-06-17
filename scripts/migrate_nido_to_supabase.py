"""
Migra nido_fechamentos e nido_fechamentos_financeiro do DW TRK para o Supabase principal.

Uso:
    DW_HOST=192.168.64.106 DW_PASS=... DATABASE_URL=... python scripts/migrate_nido_to_supabase.py

Ou defina as variáveis no .env.local e rode:
    python scripts/migrate_nido_to_supabase.py
"""

import os
import sys
import psycopg2
import psycopg2.extras
from urllib.parse import urlparse, unquote

# ── Origem: DW TRK ─────────────────────────────────────────────────────────
SRC = {
    "host":   os.environ.get("DW_HOST",   "192.168.64.106"),
    "port":   int(os.environ.get("DW_PORT", "5432")),
    "dbname": os.environ.get("DW_DB",     "dw_trk"),
    "user":   os.environ.get("DW_USER",   "usr_daviguedes"),
    "password": os.environ.get("DW_PASS", ""),
}

# ── Destino: Supabase principal ─────────────────────────────────────────────
DST_URL = os.environ.get("DATABASE_URL", "")
if not DST_URL:
    sys.exit("Erro: DATABASE_URL não definida.")
if not SRC["password"]:
    sys.exit("Erro: DW_PASS não definida.")

DDL_FECHAMENTOS = """
CREATE TABLE IF NOT EXISTS nido_fechamentos (
    codigo_fechamento   VARCHAR(13) PRIMARY KEY,
    codigo_proposta     VARCHAR(13),
    codigo_imovel       VARCHAR(13),
    data_cadastro       TIMESTAMP,
    data_fechamento     DATE,
    tipo_negocio        VARCHAR(10),
    valor_fechamento    NUMERIC,
    valor_faturamento   NUMERIC,
    valor_comissao      NUMERIC,
    qtd_parcelas        INTEGER,
    situacao            VARCHAR(20),
    mes_referencia      VARCHAR(17),
    situacao_pos_venda  VARCHAR(30),
    situacao_comissao   VARCHAR(30),
    tem_parceria        BOOLEAN,
    _etl_source         TEXT,
    _etl_loaded_at      TIMESTAMP
);
"""

DDL_FINANCEIRO = """
CREATE TABLE IF NOT EXISTS nido_fechamentos_financeiro (
    id                  SERIAL PRIMARY KEY,
    codigo_fechamento   VARCHAR(13),
    operacao            VARCHAR(10),
    data_vencimento     DATE,
    numero_parcela      INTEGER,
    valor_previsto      NUMERIC,
    data_baixa          DATE,
    tipo                TEXT,
    codigo_profissional VARCHAR(10),
    beneficiario        TEXT,
    porcentagem         NUMERIC,
    _etl_source         TEXT,
    _etl_loaded_at      TIMESTAMP
);
"""


def parse_url(url):
    u = urlparse(url)
    return {
        "host":     u.hostname,
        "port":     u.port or 5432,
        "dbname":   u.path.lstrip("/"),
        "user":     u.username,
        "password": unquote(u.password or ""),
    }


def migrate_table(src_cur, dst_conn, dst_cur, table, ddl, batch=500):
    print(f"\n→ {table}")
    src_cur.execute(f"SELECT * FROM {table}")
    cols = [d[0] for d in src_cur.description]
    rows = src_cur.fetchall()
    print(f"  {len(rows)} linhas lidas")

    dst_cur.execute(ddl)
    dst_cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE")

    placeholders = ", ".join(["%s"] * len(cols))
    col_names    = ", ".join(cols)
    insert_sql   = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

    inserted = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        psycopg2.extras.execute_batch(dst_cur, insert_sql, chunk, page_size=batch)
        inserted += len(chunk)
        print(f"  {inserted}/{len(rows)}", end="\r")

    dst_conn.commit()
    print(f"  {inserted} linhas inseridas ✓")


def main():
    print("Conectando ao DW TRK...")
    src = psycopg2.connect(**SRC)
    src_cur = src.cursor()

    print("Conectando ao Supabase principal...")
    dst = psycopg2.connect(**parse_url(DST_URL))
    dst_cur = dst.cursor()

    migrate_table(src_cur, dst, dst_cur, "nido_fechamentos", DDL_FECHAMENTOS)
    migrate_table(src_cur, dst, dst_cur, "nido_fechamentos_financeiro", DDL_FINANCEIRO)

    src.close()
    dst.close()
    print("\nMigração concluída.")


if __name__ == "__main__":
    main()
