// Descartável: colunas + amostra de pipefy_captacoes (espelho dos cards).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'pipefy_captacoes' ORDER BY ordinal_position`
for (const c of cols) console.log(`${c.column_name}  ${c.data_type}`)

const n = await sql`SELECT count(*)::int AS n FROM pipefy_captacoes`
console.log(`\nlinhas: ${n[0].n}`)
const amostra = await sql`SELECT * FROM pipefy_captacoes ORDER BY 1 DESC LIMIT 2`
console.log(JSON.stringify(amostra, null, 1).slice(0, 1500))
await sql.end()
