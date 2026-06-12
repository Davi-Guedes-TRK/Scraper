// Throwaway: aplica add_endereco_fonte.sql no Supabase via DATABASE_URL do .env.local.
// Idempotente (ADD COLUMN IF NOT EXISTS). Rodar: node scripts/_migrate_endereco_fonte.mjs
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^DATABASE_URL=(.+)$/m)
if (!m) { console.error('DATABASE_URL não encontrado no .env.local'); process.exit(1) }

const sql = postgres(m[1].trim())
const tabelas = ['imoveis_olx','imoveis_dfimoveis','imoveis_wimoveis','imoveis_facebook','imoveis_vivareal','imoveis_zap','imoveis_chavesnamao']

try {
  for (const t of tabelas) {
    await sql.unsafe(`ALTER TABLE public."${t}" ADD COLUMN IF NOT EXISTS endereco_fonte text`)
    console.log('  ALTER ok:', t)
  }
  const rows = await sql`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='endereco_fonte' AND table_name = ANY(${tabelas})
    ORDER BY table_name`
  console.log('\nTabelas com endereco_fonte:', rows.length, '/ 7')
  console.log(rows.map(r => '  - ' + r.table_name).join('\n'))
} catch (err) {
  console.error('ERRO:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
