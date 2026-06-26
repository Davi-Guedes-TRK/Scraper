#!/usr/bin/env python
"""
sync_mapa.py - Extrai dados do dw_trk e carrega no Supabase para o mapa estratégico.

Este script deve rodar na mesma infra (on-prem) que o dw_trk. Ele cria/atualiza as tabelas
mapa_demanda (peso de atendimentos abertos por bairro) e mapa_ativos (imóveis ativos).
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

QUERY_DEMANDA = """
WITH centroides AS (
    SELECT UPPER(TRIM(bairro)) as bairro_norm, AVG(latitude) as lat, AVG(longitude) as lng
    FROM nido_imoveis
    WHERE latitude IS NOT NULL AND latitude != 0 AND longitude != 0
    GROUP BY 1
),
demanda AS (
    SELECT UPPER(TRIM(a.bairro_interesse)) as bairro_norm, COUNT(*) as peso
    FROM nido_atendimentos a
    WHERE a.tipo_negocio = 'LOCAÇÃO' 
      AND a.data_cadastro >= CURRENT_DATE - INTERVAL '12 months'
      AND a.bairro_interesse IS NOT NULL AND TRIM(a.bairro_interesse) <> ''
    GROUP BY 1
)
SELECT d.bairro_norm, c.lat, c.lng, d.peso
FROM demanda d
JOIN centroides c ON c.bairro_norm = d.bairro_norm
WHERE d.peso > 0;
"""

QUERY_ATIVOS = """
SELECT i.codigo_imovel, UPPER(TRIM(i.bairro)) as bairro, i.latitude as lat, i.longitude as lng, i.tipo_imovel, i.preco_locacao as preco
FROM nido_imoveis i
WHERE i.situacao = 'Ativo' 
  AND i.disponivel_locacao = true
  AND i.latitude IS NOT NULL AND i.latitude != 0 AND i.longitude != 0
"""

def main():
    dw_url = os.getenv("DW_DATABASE_URL")
    sb_url = os.getenv("DATABASE_URL")
    
    if not dw_url or not sb_url:
        sys.exit("[ERRO] Defina DW_DATABASE_URL e DATABASE_URL no .env")
        
    print("[1] Extraindo dados do dw_trk...")
    with psycopg2.connect(dw_url) as dw, dw.cursor() as cur:
        cur.execute(QUERY_DEMANDA)
        rows_demanda = cur.fetchall()
        print(f" -> {len(rows_demanda)} bairros com demanda extraídos.")
        
        cur.execute(QUERY_ATIVOS)
        rows_ativos = cur.fetchall()
        print(f" -> {len(rows_ativos)} imóveis ativos extraídos.")

    if not rows_demanda and not rows_ativos:
        print("[aviso] Sem dados. Abortando.")
        return

    print("[2] Sincronizando com Supabase...")
    with psycopg2.connect(sb_url) as sb, sb.cursor() as cur:
        # Tabela mapa_demanda
        cur.execute("CREATE TABLE IF NOT EXISTS public.mapa_demanda (bairro text PRIMARY KEY, lat float8, lng float8, peso int8);")
        cur.execute("TRUNCATE public.mapa_demanda;")
        
        insert_demanda = "INSERT INTO public.mapa_demanda (bairro, lat, lng, peso) VALUES %s"
        execute_values(cur, insert_demanda, rows_demanda)
        
        # Tabela mapa_ativos
        cur.execute("CREATE TABLE IF NOT EXISTS public.mapa_ativos (codigo_imovel text PRIMARY KEY, bairro text, lat float8, lng float8, tipo_imovel text, preco float8);")
        cur.execute("TRUNCATE public.mapa_ativos;")
        
        insert_ativos = "INSERT INTO public.mapa_ativos (codigo_imovel, bairro, lat, lng, tipo_imovel, preco) VALUES %s"
        execute_values(cur, insert_ativos, rows_ativos)
        
        sb.commit()
        
    print("[SUCESSO] Sincronização concluída com êxito!")

if __name__ == "__main__":
    main()
