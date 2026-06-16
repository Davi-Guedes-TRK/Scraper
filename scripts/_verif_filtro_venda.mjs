import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const sql = postgres((env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim(), { ssl: 'require', max: 1 })
const r = await sql`
  SELECT
    count(*)::int AS antes,
    count(*) FILTER (WHERE coalesce(tipo,'') NOT ILIKE 'venda' AND coalesce(tipo_imovel,'') NOT ILIKE 'venda%')::int AS depois
  FROM imoveis_todos
  WHERE status_triagem='pendente' AND portal <> 'chavesnamao'
    AND (creci IS NULL OR creci != '22784')
    AND coletado_em >= NOW() - INTERVAL '30 days'`
console.log(`fila triagem: antes=${r[0].antes} → depois=${r[0].depois} (removidos ${r[0].antes - r[0].depois} de venda)`)
await sql.end()
