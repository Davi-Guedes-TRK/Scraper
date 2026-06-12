import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 15
export const dynamic = 'force-dynamic'

// Agregados do "pregão" — visão bolsa-de-valores do pipeline de captação.
// O client (/pregao) faz polling aqui a cada 30s.

export type PregaoData = {
  agora: string
  funil: {
    na_fila: number; aprovados: number
    mat_enviada: number; mat_recebida: number
    espera_matricula_dias: number | null
    dedup_ja_na_base: number; dedup_conferir: number; dedup_liberado: number
    onus_enviada: number; onus_recebida: number; contato_ok: number
    espera_onus_dias: number | null
  }
  indices: {
    hoje: number; d7: number; d7_prev: number
    mat_solicitadas_total: number; mat_recebidas_total: number
    onus_solicitadas_total: number; contatos_total: number
  }
  ticker: Array<{ link: string; titulo: string | null; regiao: string | null; preco: string | null; portal: string; coletado_em: string }>
  volume14d: Array<{ dia: string; n: number }>
  parados: Array<{ tipo: string; endereco: string; dias: number; link: string }>
}

export async function GET() {
  const [funilRows, onusRows, ticker, volume, paradosMat, paradosOnus] = await Promise.all([
    sql`
      SELECT
        count(*) FILTER (WHERE status_triagem = 'pendente')  ::int AS na_fila,
        count(*) FILTER (WHERE status_triagem = 'aprovado')  ::int AS aprovados,
        count(*) FILTER (WHERE status_solicitacao = 'enviado')::int AS mat_enviada,
        count(*) FILTER (WHERE status_solicitacao = 'recebido')::int AS mat_recebida,
        count(*) FILTER (WHERE status_solicitacao IN ('enviado','recebido','completo'))::int AS mat_solicitadas_total,
        count(*) FILTER (WHERE numero_matricula IS NOT NULL AND btrim(numero_matricula) NOT IN ('', 'N/A'))::int AS mat_recebidas_total,
        count(*) FILTER (WHERE coletado_em >= CURRENT_DATE)  ::int AS hoje,
        count(*) FILTER (WHERE coletado_em >= now() - interval '7 days')::int AS d7,
        count(*) FILTER (WHERE coletado_em >= now() - interval '14 days' AND coletado_em < now() - interval '7 days')::int AS d7_prev,
        round(avg(extract(epoch FROM now() - status_solicitacao_em) / 86400)
          FILTER (WHERE status_solicitacao = 'enviado'))::int AS espera_matricula_dias
      FROM imoveis_todos
      WHERE portal <> 'chavesnamao'`,
    sql`
      SELECT
        count(*) FILTER (WHERE dedup_nivel = 'exato')   ::int AS dedup_ja_na_base,
        count(*) FILTER (WHERE dedup_nivel = 'provavel')::int AS dedup_conferir,
        count(*) FILTER (WHERE dedup_nivel = 'nenhum' AND onus_solicitada_em IS NULL)::int AS dedup_liberado,
        count(*) FILTER (WHERE onus_solicitada_em IS NOT NULL AND onus_recebida_em IS NULL)::int AS onus_enviada,
        count(*) FILTER (WHERE onus_recebida_em IS NOT NULL)::int AS onus_recebida,
        count(*) FILTER (WHERE onus_solicitada_em IS NOT NULL)::int AS onus_solicitadas_total,
        count(*) FILTER (WHERE cardinality(coalesce(telefones, '{}')) > 0 OR cardinality(coalesce(emails, '{}')) > 0)::int AS contato_ok,
        round(avg(extract(epoch FROM now() - onus_solicitada_em) / 86400)
          FILTER (WHERE onus_solicitada_em IS NOT NULL AND onus_recebida_em IS NULL))::int AS espera_onus_dias
      FROM onus_pipeline`,
    sql`
      SELECT link, titulo, coalesce(nullif(cidade, 'Brasília'), bairro) AS regiao, preco, portal, coletado_em
      FROM imoveis_todos
      WHERE coletado_em >= CURRENT_DATE AND portal <> 'chavesnamao'
      ORDER BY coletado_em DESC LIMIT 40`,
    sql`
      SELECT to_char(coletado_em::date, 'YYYY-MM-DD') AS dia, count(*)::int AS n
      FROM imoveis_todos
      WHERE coletado_em >= CURRENT_DATE - 13 AND portal <> 'chavesnamao'
      GROUP BY 1 ORDER BY 1`,
    sql`
      SELECT 'matrícula sem resposta' AS tipo,
             coalesce(endereco, titulo, link) AS endereco,
             floor(extract(epoch FROM now() - status_solicitacao_em) / 86400)::int AS dias,
             link
      FROM imoveis_todos
      WHERE status_solicitacao = 'enviado'
        AND status_solicitacao_em < now() - interval '7 days'
        AND portal <> 'chavesnamao'
      ORDER BY status_solicitacao_em LIMIT 10`,
    sql`
      SELECT 'ônus sem resposta' AS tipo,
             coalesce(endereco, link) AS endereco,
             floor(extract(epoch FROM now() - onus_solicitada_em) / 86400)::int AS dias,
             link
      FROM onus_pipeline
      WHERE onus_solicitada_em IS NOT NULL AND onus_recebida_em IS NULL
        AND onus_solicitada_em < now() - interval '7 days'
      ORDER BY onus_solicitada_em LIMIT 10`,
  ])

  const f = funilRows[0]
  const o = onusRows[0]

  const data: PregaoData = {
    agora: new Date().toISOString(),
    funil: {
      na_fila: f.na_fila, aprovados: f.aprovados,
      mat_enviada: f.mat_enviada, mat_recebida: f.mat_recebida,
      espera_matricula_dias: f.espera_matricula_dias,
      dedup_ja_na_base: o.dedup_ja_na_base, dedup_conferir: o.dedup_conferir, dedup_liberado: o.dedup_liberado,
      onus_enviada: o.onus_enviada, onus_recebida: o.onus_recebida, contato_ok: o.contato_ok,
      espera_onus_dias: o.espera_onus_dias,
    },
    indices: {
      hoje: f.hoje, d7: f.d7, d7_prev: f.d7_prev,
      mat_solicitadas_total: f.mat_solicitadas_total, mat_recebidas_total: f.mat_recebidas_total,
      onus_solicitadas_total: o.onus_solicitadas_total, contatos_total: o.contato_ok,
    },
    ticker: ticker as PregaoData['ticker'],
    volume14d: volume as PregaoData['volume14d'],
    parados: [...paradosMat, ...paradosOnus].sort((a, b) => b.dias - a.dias) as PregaoData['parados'],
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
