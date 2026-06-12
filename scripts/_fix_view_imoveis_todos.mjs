// Throwaway: recria a view imoveis_todos acrescentando status_solicitacao_em e
// endereco_fonte (ausentes). Reaproveita a definição atual e só APPENDA as 2 colunas
// no fim de cada branch do UNION (CREATE OR REPLACE só permite acrescentar no fim).
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
const url = env.match(/^DATABASE_URL=(.+)$/m)[1].trim()
const sql = postgres(url)

const VIEW_TABLES = ['imoveis_dfimoveis','imoveis_olx','imoveis_vivareal','imoveis_zap','imoveis_chavesnamao']

try {
  // 1) garante as colunas nas 5 tabelas da view (idempotente)
  for (const t of VIEW_TABLES) {
    await sql.unsafe(`ALTER TABLE public."${t}" ADD COLUMN IF NOT EXISTS status_solicitacao_em timestamptz`)
    await sql.unsafe(`ALTER TABLE public."${t}" ADD COLUMN IF NOT EXISTS endereco_fonte text`)
  }

  // 2) pega a def atual e appenda as 2 colunas após numero_matricula em cada branch
  const [{ def }] = await sql`SELECT pg_get_viewdef('public.imoveis_todos'::regclass, true) AS def`
  let n = 0
  const novaDef = def.replace(
    /imoveis_(\w+)\.numero_matricula(\s+)FROM imoveis_\1/g,
    (_m, t, ws) => {
      n++
      return `imoveis_${t}.numero_matricula,\n    imoveis_${t}.status_solicitacao_em,\n    imoveis_${t}.endereco_fonte${ws}FROM imoveis_${t}`
    },
  )
  if (n !== 5) { throw new Error(`esperava 5 branches, casei ${n} — abortando sem mexer na view`) }

  // 3) recria a view (atômico: se falhar, a view antiga permanece)
  await sql.unsafe(`CREATE OR REPLACE VIEW public.imoveis_todos AS ${novaDef}`)
  console.log(`View recriada (${n} branches).`)

  // 4) sanity check
  const cols = await sql`SELECT column_name FROM information_schema.columns
    WHERE table_name='imoveis_todos' AND column_name IN ('status_solicitacao_em','endereco_fonte') ORDER BY column_name`
  console.log('Colunas novas na view:', cols.map(c => c.column_name).join(', '))
  await sql`SELECT endereco_fonte, status_solicitacao_em FROM imoveis_todos LIMIT 1`
  console.log('SELECT de teste OK — view consistente.')
} catch (err) {
  console.error('ERRO:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
