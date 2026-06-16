// Read-only: lista colunas de auth.users e auth.identities p/ montar o INSERT
// correto de criação de usuário (varia por versão do GoTrue).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

for (const t of ['users', 'identities']) {
  const cols = await sql`
    SELECT column_name, is_nullable, column_default IS NOT NULL AS tem_default
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = ${t}
    ORDER BY ordinal_position`
  console.log(`\n── auth.${t} ──`)
  for (const c of cols) console.log(`  ${c.column_name}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.tem_default ? ' [default]' : ''}`)
}
// pgcrypto disponível? (crypt/gen_salt)
const ext = await sql`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','uuid-ossp')`
console.log('\nextensões:', ext.map(e => e.extname).join(', ') || '(nenhuma das procuradas)')
await sql.end()
