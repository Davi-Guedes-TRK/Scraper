// Aplica scripts/sql/create_dw_mirror.sql no Supabase (DATABASE_URL do .env.local).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

const ddl = readFileSync(resolve(ROOT, 'scripts', 'sql', 'create_dw_mirror.sql'), 'utf8')
await sql.unsafe(ddl)
const t = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('dw_imoveis','dw_pessoas')`
console.log('Criadas:', t.map((r) => r.table_name).join(', '))
await sql.end()
