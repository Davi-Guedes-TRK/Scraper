#!/usr/bin/env python
"""
sync_nao_adm.py — materializa "Alugamos, não Administramos" do Nido (dw_trk) no Supabase.

Imóveis que a TRK ALUGOU mas NÃO administra (escolha do proprietário):
no Nido = situacao='Inativo' AND situacao_detalhe='Negociado', com código de imóvel TRK.
São leads quentes (o dono já fechou locação com a gente) p/ reconquistar a administração.

Roda on-prem (alcança o dw_trk), após o ETL diário. Requer no .env:
    DW_DATABASE_URL  -> dw_trk (rede local, read-only)
    DATABASE_URL     -> Supabase (destino)
"""
import os
import sys
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# TRK pelo prefixo do codigo_imovel: VK (Brasília), LK (Adm), GY (Goiânia), CL (Corporativo)
QUERY_DW = """
SELECT i.codigo_imovel,
       p.nome                                   AS proprietario,
       p.telefone_1                             AS telefone,
       i.tipo_imovel, i.bairro, i.cidade,
       NULLIF(BTRIM(CONCAT_WS(' ', i.logradouro, NULLIF(i.numero::text, '0'), i.complemento)), '') AS endereco,
       i.area_util,
       i.preco_locacao                          AS valor_locacao,
       (CURRENT_DATE - i.data_atualizacao::date) AS dias_inativo,
       i.data_atualizacao::date                 AS desde,
       NULLIF(i.latitude, 0)                    AS lat,
       NULLIF(i.longitude, 0)                   AS lng
FROM nido_imoveis i
JOIN nido_pessoas p ON p.codigo_pessoa = i.codigo_proprietario
WHERE i.situacao = 'Inativo' AND i.situacao_detalhe = 'Negociado'
  AND i.preco_locacao > 0   -- locação ou venda/locação (exclui imóveis só de venda)
  AND regexp_replace(i.codigo_imovel, '[0-9].*$', '') IN ('VK', 'LK', 'GY', 'CL')
  AND p.telefone_1 IS NOT NULL AND BTRIM(p.telefone_1) <> ''
ORDER BY i.data_atualizacao DESC;
"""

COLS = ["codigo_imovel", "proprietario", "telefone", "tipo_imovel", "bairro", "cidade",
        "endereco", "area_util", "valor_locacao", "dias_inativo", "desde", "lat", "lng"]

DDL = """
CREATE TABLE IF NOT EXISTS public.leads_nao_adm (
  codigo_imovel  text,
  proprietario   text,
  telefone       text,
  tipo_imovel    text,
  bairro         text,
  cidade         text,
  endereco       text,
  area_util      numeric,
  valor_locacao  numeric,
  dias_inativo   integer,
  desde          date,
  lat            double precision,
  lng            double precision,
  synced_at      timestamptz DEFAULT now()
);
"""


def main():
    dw_url = os.getenv("DW_DATABASE_URL")
    sb_url = os.getenv("DATABASE_URL")
    if not dw_url or not sb_url:
        sys.exit("[ERRO] Defina DW_DATABASE_URL e DATABASE_URL no .env")

    with psycopg2.connect(dw_url) as dw, dw.cursor() as cur:
        cur.execute(QUERY_DW)
        rows = cur.fetchall()
    print(f"[dw_trk] {len(rows)} imóveis alugados-não-administrados.")
    if not rows:
        print("[aviso] nada retornado; nada a sincronizar.")
        return

    insert_sql = f"INSERT INTO public.leads_nao_adm ({', '.join(COLS)}) VALUES %s"
    with psycopg2.connect(sb_url) as sb:
        with sb.cursor() as cur:
            cur.execute(DDL)
            cur.execute("TRUNCATE public.leads_nao_adm;")
            execute_values(cur, insert_sql, rows)
        sb.commit()
    print(f"[supabase] leads_nao_adm recarregada com {len(rows)} linhas.")


if __name__ == "__main__":
    main()
