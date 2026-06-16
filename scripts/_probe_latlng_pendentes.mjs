import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const sql = postgres((env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim(), { ssl: 'require', max: 1 })
const r = await sql`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int AS com_coord
  FROM imoveis_todos
  WHERE status_triagem='pendente' AND portal <> 'chavesnamao'
    AND coalesce(tipo,'') NOT ILIKE 'venda' AND coalesce(tipo_imovel,'') NOT ILIKE 'venda%'
    AND coletado_em >= NOW() - INTERVAL '30 days'`
console.log(`pendentes (locação): ${r[0].total} | com lat/lng: ${r[0].com_coord}`)
await sql.end()
