// Descartável: roda as queries do /api/pregao direto no banco p/ validar o SQL.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

const funil = await sql`
  SELECT
    count(*) FILTER (WHERE status_triagem = 'pendente')  ::int AS na_fila,
    count(*) FILTER (WHERE status_triagem = 'aprovado')  ::int AS aprovados,
    count(*) FILTER (WHERE status_solicitacao = 'enviado')::int AS mat_enviada,
    count(*) FILTER (WHERE status_solicitacao = 'recebido')::int AS mat_recebida,
    count(*) FILTER (WHERE numero_matricula IS NOT NULL AND btrim(numero_matricula) NOT IN ('', 'N/A'))::int AS mat_recebidas_total,
    count(*) FILTER (WHERE coletado_em >= CURRENT_DATE)  ::int AS hoje,
    count(*) FILTER (WHERE coletado_em >= now() - interval '7 days')::int AS d7,
    round(avg(extract(epoch FROM now() - status_solicitacao_em) / 86400)
      FILTER (WHERE status_solicitacao = 'enviado'))::int AS espera_matricula_dias
  FROM imoveis_todos WHERE portal <> 'chavesnamao'`
console.log('funil:', JSON.stringify(funil[0]))

const onus = await sql`
  SELECT
    count(*) FILTER (WHERE dedup_nivel = 'exato')   ::int AS dedup_ja_na_base,
    count(*) FILTER (WHERE dedup_nivel = 'provavel')::int AS dedup_conferir,
    count(*) FILTER (WHERE dedup_nivel = 'nenhum' AND onus_solicitada_em IS NULL)::int AS dedup_liberado,
    count(*) FILTER (WHERE onus_solicitada_em IS NOT NULL AND onus_recebida_em IS NULL)::int AS onus_enviada,
    count(*) FILTER (WHERE onus_recebida_em IS NOT NULL)::int AS onus_recebida,
    count(*) FILTER (WHERE cardinality(coalesce(telefones, '{}')) > 0 OR cardinality(coalesce(emails, '{}')) > 0)::int AS contato_ok
  FROM onus_pipeline`
console.log('onus:', JSON.stringify(onus[0]))

const ticker = await sql`
  SELECT count(*)::int AS n FROM imoveis_todos
  WHERE coletado_em >= CURRENT_DATE AND portal <> 'chavesnamao'`
console.log('ticker hoje:', ticker[0].n)

const volume = await sql`
  SELECT to_char(coletado_em::date, 'YYYY-MM-DD') AS dia, count(*)::int AS n
  FROM imoveis_todos
  WHERE coletado_em >= CURRENT_DATE - 13 AND portal <> 'chavesnamao'
  GROUP BY 1 ORDER BY 1`
console.log('volume14d:', volume.length, 'dias —', volume.map(v => `${v.dia.slice(8)}:${v.n}`).join(' '))

await sql.end()
