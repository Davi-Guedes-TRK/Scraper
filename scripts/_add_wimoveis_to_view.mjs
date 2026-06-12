// Migração: adiciona imoveis_wimoveis à view imoveis_todos.
// Garante colunas extras na tabela e appenda o branch UNION ao final da view.
// Rodar UMA VEZ: node scripts/_add_wimoveis_to_view.mjs
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
const url = env.match(/^DATABASE_URL=(.+)$/m)[1].trim()
const sql = postgres(url)

const TABLE = 'imoveis_wimoveis'

try {
  // 1) Garante colunas extras (triagem, cartório, geo) — idempotente
  const extra_cols = [
    ['status_triagem',      'text',        "'pendente'::text"],
    ['maps_link',           'text',        'NULL'],
    ['lat',                 'double precision', 'NULL'],
    ['lng',                 'double precision', 'NULL'],
    ['endereco',            'text',        'NULL'],
    ['geocoded_em',         'timestamptz', 'NULL'],
    ['numero_matricula',    'text',        'NULL'],
    ['status_solicitacao',  'text',        'NULL'],
    ['status_solicitacao_em','timestamptz','NULL'],
    ['endereco_fonte',      'text',        'NULL'],
    ['pistas_ia',           'jsonb',       'NULL'],
  ]
  for (const [col, type, def] of extra_cols) {
    await sql.unsafe(`ALTER TABLE public."${TABLE}" ADD COLUMN IF NOT EXISTS "${col}" ${type} DEFAULT ${def}`)
  }
  console.log(`Colunas extras garantidas em ${TABLE}.`)

  // 2) Obtém a def atual da view
  const [{ def }] = await sql`SELECT pg_get_viewdef('public.imoveis_todos'::regclass, true) AS def`

  // 3) Verifica se wimoveis já está na view
  if (def.includes(TABLE)) {
    console.log('imoveis_wimoveis já está na view — nada a fazer.')
    process.exit(0)
  }

  // 4) Extrai a lista de colunas de um branch existente (pega o primeiro UNION branch)
  // O padrão é: SELECT 'portal'::text AS portal, col1, col2, ... FROM imoveis_portal
  const m = def.match(/SELECT\s+'(\w+)'::text AS portal,([\s\S]+?)\s+FROM\s+imoveis_\1/i)
  if (!m) throw new Error('Não consegui parsear a definição da view — revise manualmente.')
  const colList = m[2].trim()

  // 5) Monta novo branch substituindo o nome do portal e tabela
  // O colList tem referências ao portal original (ex: imoveis_olx.campo). Precisa trocar.
  const originalPortal = m[1]
  const newBranch = `
  SELECT 'wimoveis'::text AS portal,${colList
    .replace(new RegExp(`imoveis_${originalPortal}\\.`, 'g'), `imoveis_wimoveis.`)}
  FROM imoveis_wimoveis`

  // 6) Appenda o UNION ALL ao final da view
  const novaDef = `CREATE OR REPLACE VIEW public.imoveis_todos AS ${def.trimEnd()} UNION ALL${newBranch}`
  await sql.unsafe(novaDef)
  console.log('View recriada com imoveis_wimoveis.')

  // 7) Sanity check
  const count = await sql`SELECT count(*) FROM imoveis_todos WHERE portal = 'wimoveis'`
  console.log(`Registros wimoveis visíveis na view: ${count[0].count}`)
} catch (err) {
  console.error('ERRO:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
