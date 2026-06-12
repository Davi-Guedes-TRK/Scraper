// Descartável genérico: aplica um arquivo .sql no Supabase (DATABASE_URL do .env.local).
// Uso: node scripts/_run_sql.mjs scripts/sql/arquivo.sql
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const arquivo = process.argv[2]
if (!arquivo) { console.error('Uso: node scripts/_run_sql.mjs <arquivo.sql>'); process.exit(1) }

const sql = postgres(url, { ssl: 'require', max: 1 })
await sql.unsafe(readFileSync(resolve(ROOT, arquivo), 'utf8'))
console.log(`✓ aplicado: ${arquivo}`)
await sql.end()
