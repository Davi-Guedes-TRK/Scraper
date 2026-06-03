#!/usr/bin/env python3
"""Materializa o funil de inquilinos (demanda de locação do Nido) no Supabase.

funil_inquilinos = atendimentos de LOCAÇÃO do dw_trk, com flag tem_proposta.
Alimenta /analitico/funil-inquilinos (Atendimento → Com Proposta → Fechado).
Full-refresh (TRUNCATE + load). Roda on-prem (alcança o dw_trk).

Variáveis: DW_DATABASE_URL (Nido), DATABASE_URL (Supabase).
"""
import os
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

QUERY_DW = """
SELECT a.codigo_atendimento, a.situacao, a.regiao_interesse, a.bairro_interesse,
       a.tipo_imovel_buscado, a.canal_origem, a.motivo_encerramento,
       NULLIF(a.preco_minimo, 0), NULLIF(a.preco_maximo, 0), a.data_cadastro,
       EXISTS (SELECT 1 FROM nido_propostas p WHERE p.codigo_atendimento = a.codigo_atendimento)
FROM nido_atendimentos a
WHERE a.tipo_negocio = 'LOCAÇÃO';
"""

COLS = ["codigo_atendimento", "situacao", "regiao", "bairro", "tipo", "canal", "motivo",
        "preco_min", "preco_max", "criado_em", "tem_proposta"]

DDL = """
CREATE TABLE IF NOT EXISTS public.funil_inquilinos (
  codigo_atendimento text PRIMARY KEY,
  situacao text, regiao text, bairro text, tipo text, canal text, motivo text,
  preco_min numeric, preco_max numeric, criado_em timestamptz, tem_proposta boolean,
  synced_at timestamptz DEFAULT now()
);
"""


def main() -> None:
    dw_url = os.environ["DW_DATABASE_URL"]
    sb_url = os.environ["DATABASE_URL"]

    with psycopg2.connect(dw_url) as dw, dw.cursor() as cur:
        cur.execute(QUERY_DW)
        rows = cur.fetchall()
    print(f"[dw_trk] {len(rows)} atendimentos de locação.")

    insert_sql = f"INSERT INTO public.funil_inquilinos ({', '.join(COLS)}) VALUES %s"
    with psycopg2.connect(sb_url) as sb:
        with sb.cursor() as cur:
            cur.execute(DDL)
            cur.execute("TRUNCATE public.funil_inquilinos;")
            execute_values(cur, insert_sql, rows, page_size=2000)
        sb.commit()
    print(f"[supabase] funil_inquilinos recarregado com {len(rows)} linhas.")


if __name__ == "__main__":
    main()
