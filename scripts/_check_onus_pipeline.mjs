import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

const total = await sql`SELECT count(*)::int n FROM onus_pipeline`
console.log('onus_pipeline total:', total[0].n)

const porNivel = await sql`
  SELECT dedup_nivel,
         count(*)::int n,
         count(*) FILTER (WHERE onus_solicitada_em IS NULL)::int sem_onus
  FROM onus_pipeline GROUP BY 1 ORDER BY 1`
for (const r of porNivel) console.log(`  ${r.dedup_nivel}: ${r.n} (sem ônus solicitada: ${r.sem_onus})`)

const fila = await sql`
  SELECT link, endereco, matricula, bairro, cidade
  FROM onus_pipeline
  WHERE dedup_nivel = 'nenhum' AND onus_solicitada_em IS NULL
    AND matricula IS NOT NULL AND btrim(matricula) <> ''
  ORDER BY criado_em LIMIT 10`
console.log(`\nfila do --from-gate: ${fila.length} elegível(is)`)
for (const r of fila) console.log(`  matr ${r.matricula} | ${r.endereco} | ${r.bairro ?? r.cidade}`)

await sql.end()
