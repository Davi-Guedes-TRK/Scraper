// Read-only: como distinguir venda de aluguel na fila da triagem.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

console.log('── coluna `tipo` (distinct, pendentes) ──')
for (const r of await sql`
  SELECT coalesce(tipo,'(null)') AS tipo, count(*)::int n
  FROM imoveis_todos WHERE status_triagem='pendente' GROUP BY 1 ORDER BY n DESC LIMIT 20`)
  console.log(`  ${r.tipo}: ${r.n}`)

console.log('\n── tipo_imovel que parece VENDA (pendentes) ──')
for (const r of await sql`
  SELECT tipo_imovel, count(*)::int n
  FROM imoveis_todos
  WHERE status_triagem='pendente' AND (tipo_imovel ILIKE '%venda%' OR tipo_imovel ILIKE '%compra%')
  GROUP BY 1 ORDER BY n DESC LIMIT 20`)
  console.log(`  ${r.tipo_imovel}: ${r.n}`)

console.log('\n── amostra de possíveis vendas (preço alto, pendentes) ──')
for (const r of await sql`
  SELECT portal, tipo, tipo_imovel, preco, titulo
  FROM imoveis_todos
  WHERE status_triagem='pendente' AND (titulo ILIKE '%venda%' OR tipo_imovel ILIKE '%venda%' OR tipo ILIKE '%venda%')
  LIMIT 12`)
  console.log(`  [${r.portal}] tipo=${r.tipo} | tipo_imovel=${r.tipo_imovel} | ${r.preco} | ${String(r.titulo).slice(0,50)}`)

console.log('\n── contagem venda vs aluguel (heurística por tipo/tipo_imovel) ──')
const c = await sql`
  SELECT
    count(*) FILTER (WHERE tipo ILIKE '%venda%' OR tipo_imovel ILIKE '%venda%')::int AS venda,
    count(*) FILTER (WHERE tipo ILIKE '%alug%' OR tipo_imovel ILIKE '%alug%' OR tipo ILIKE '%locac%')::int AS aluguel,
    count(*) FILTER (WHERE tipo IS NULL AND tipo_imovel NOT ILIKE '%venda%' AND tipo_imovel NOT ILIKE '%alug%')::int AS indefinido,
    count(*)::int AS total
  FROM imoveis_todos WHERE status_triagem='pendente'`
console.log('  ', JSON.stringify(c[0]))
await sql.end()
