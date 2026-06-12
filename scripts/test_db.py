import os, psycopg2
from dotenv import load_dotenv
load_dotenv('.env.local')
conn=psycopg2.connect(os.environ['DATABASE_URL'])
cur=conn.cursor()

cur.execute("""
WITH top2000 AS (
    SELECT * FROM imoveis_todos 
    WHERE status_triagem = 'pendente' 
      AND portal <> 'chavesnamao' 
      AND (creci IS NULL OR creci != '22784') 
      AND coletado_em >= NOW() - INTERVAL '30 days' 
    ORDER BY coletado_em DESC 
    LIMIT 2000
)
SELECT portal, cidade, bairro, titulo FROM top2000 WHERE bairro ILIKE '%lago sul%' OR cidade ILIKE '%lago sul%' OR cidade ILIKE '%lago-sul%' OR bairro ILIKE '%lago-sul%'
""")
for r in cur.fetchall():
    print(r)
