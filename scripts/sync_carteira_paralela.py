#!/usr/bin/env python
"""
sync_carteira_paralela.py — materializa o MATCHING demanda×oferta do Nido no Supabase.

Carteira Paralela = inquilino procurando AGORA (atendimento Ativo/Proposta) × imóvel
DISPONÍVEL que NÃO administramos (sem código IM) e com contato do dono, que ENCAIXA no
perfil (tipo + bairro + dentro da faixa de preço). Cada par = ligar pro dono com inquilino
na mão e fechar COM administração.

Match por tipo+bairro+preço (área/dormitórios vão como INFO — cortar por área zera a lista).
Roda on-prem (alcança o dw_trk). Requer DW_DATABASE_URL e DATABASE_URL no .env.
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

QUERY_DW = """
SELECT
  a.codigo_atendimento,
  t.nome                                   AS inquilino,
  a.tipo_imovel_buscado                    AS busca_tipo,
  a.bairro_interesse                       AS busca_bairro,
  a.preco_minimo                           AS busca_preco_min,
  a.preco_maximo                           AS busca_preco_max,
  a.min_area_util                          AS busca_area_min,
  a.max_area_util                          AS busca_area_max,
  a.qtd_minima_dormitorios                 AS busca_dorm,
  i.codigo_imovel, i.tipo_imovel, i.bairro,
  NULLIF(BTRIM(CONCAT_WS(' ', i.logradouro, NULLIF(i.numero::text, '0'), i.complemento)), '') AS endereco,
  i.area_util, i.qtd_dormitorios, i.preco_locacao,
  p.nome                                   AS proprietario,
  p.telefone_1                             AS telefone,
  NULLIF(i.latitude, 0)                    AS lat,
  NULLIF(i.longitude, 0)                   AS lng
FROM nido_atendimentos a
LEFT JOIN nido_pessoas t ON t.codigo_pessoa = a.codigo_pessoa
JOIN nido_imoveis i
  ON UPPER(TRIM(i.tipo_imovel)) = UPPER(TRIM(a.tipo_imovel_buscado))
 AND UPPER(TRIM(i.bairro))      = UPPER(TRIM(a.bairro_interesse))
 AND i.preco_locacao BETWEEN COALESCE(NULLIF(a.preco_minimo, 0), 0) AND a.preco_maximo
JOIN nido_pessoas p ON p.codigo_pessoa = i.codigo_proprietario
WHERE a.tipo_negocio = 'LOCAÇÃO' AND a.situacao IN ('Ativo', 'Proposta')
  AND a.bairro_interesse IS NOT NULL AND a.tipo_imovel_buscado IS NOT NULL AND a.preco_maximo > 0
  AND i.disponivel_locacao = true AND i.preco_locacao > 0
  AND (i.codigo_legado IS NULL OR BTRIM(i.codigo_legado) = '')   -- não administrado (fecha COM adm)
  AND p.telefone_1 IS NOT NULL AND BTRIM(p.telefone_1) <> ''
ORDER BY a.codigo_atendimento, i.preco_locacao;
"""

COLS = ["codigo_atendimento", "inquilino", "busca_tipo", "busca_bairro", "busca_preco_min",
        "busca_preco_max", "busca_area_min", "busca_area_max", "busca_dorm",
        "codigo_imovel", "tipo_imovel", "bairro", "endereco", "area_util", "qtd_dormitorios",
        "preco_locacao", "proprietario", "telefone", "lat", "lng"]

DDL = """
CREATE TABLE IF NOT EXISTS public.carteira_paralela (
  codigo_atendimento text,
  inquilino          text,
  busca_tipo         text,
  busca_bairro       text,
  busca_preco_min    numeric,
  busca_preco_max    numeric,
  busca_area_min     numeric,
  busca_area_max     numeric,
  busca_dorm         integer,
  codigo_imovel      text,
  tipo_imovel        text,
  bairro             text,
  endereco           text,
  area_util          numeric,
  qtd_dormitorios    integer,
  preco_locacao      numeric,
  proprietario       text,
  telefone           text,
  lat                double precision,
  lng                double precision,
  synced_at          timestamptz DEFAULT now()
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
    print(f"[dw_trk] {len(rows)} matches (inquilino × imóvel capturável).")
    if not rows:
        print("[aviso] nenhum match; nada a sincronizar.")
        return

    insert_sql = f"INSERT INTO public.carteira_paralela ({', '.join(COLS)}) VALUES %s"
    with psycopg2.connect(sb_url) as sb:
        with sb.cursor() as cur:
            cur.execute(DDL)
            cur.execute("TRUNCATE public.carteira_paralela;")
            execute_values(cur, insert_sql, rows)
        sb.commit()
    print(f"[supabase] carteira_paralela recarregada com {len(rows)} linhas.")


if __name__ == "__main__":
    main()
