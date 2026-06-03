import { NextRequest } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

// Funil do pipe "COM - Oportunidades" (307179010):
// Informações Básicas → Qualificação → Negociação → Captado / Não Captado.
// Stages do funil usam a 1ª entrada na fase (phases_history) para refletir progressão real.

function resolverDesde(range: string): string {
  const d = new Date()
  if (range === '7d')  { d.setDate(d.getDate() - 7);   return d.toISOString().slice(0, 10) }
  if (range === '30d') { d.setDate(d.getDate() - 30);  return d.toISOString().slice(0, 10) }
  if (range === '90d') { d.setDate(d.getDate() - 90);  return d.toISOString().slice(0, 10) }
  if (range === 'ano') { return `${d.getFullYear()}-01-01` }
  return '2024-01-01'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bairro = searchParams.get('bairro')      ?? 'Todos'
  const tipo   = searchParams.get('tipo_imovel') ?? 'Todos'

  const desdeParam = searchParams.get('desde')
  const ateParam   = searchParams.get('ate')
  const desde = desdeParam || resolverDesde(searchParams.get('range') ?? 'tudo')
  const ate   = ateParam   || new Date().toISOString().slice(0, 10)

  const [statsRows, motivosRows, fasesRows, porBairroRows, porTipoRows, porMesRows, origemRows, filtrosRow, anunciosRow] = await Promise.all([

    sql`
      SELECT
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE qualificacao_entrada IS NOT NULL)::int AS qualificados,
        count(*) FILTER (WHERE negociacao_entrada IS NOT NULL)::int AS negociacao,
        count(*) FILTER (WHERE fase_atual = 'Captado')::int AS captados,
        round(count(*) FILTER (WHERE fase_atual = 'Não Captado') * 100.0 / NULLIF(count(*), 0), 1)::float AS taxa_perda,
        count(*) FILTER (WHERE fase_atual NOT IN ('Captado', 'Não Captado'))::int AS em_andamento,
        round(avg(valor_estimado) FILTER (WHERE valor_estimado > 0))::int AS valor_geral,
        round(avg(valor_estimado) FILTER (WHERE qualificacao_entrada IS NOT NULL AND valor_estimado > 0))::int AS valor_qualificados,
        round(avg(valor_estimado) FILTER (WHERE negociacao_entrada IS NOT NULL AND valor_estimado > 0))::int AS valor_negociacao,
        round(avg(valor_estimado) FILTER (WHERE fase_atual = 'Captado' AND valor_estimado > 0))::int AS valor_captados,
        round(avg(qualificacao_dias) FILTER (WHERE qualificacao_dias BETWEEN 0.01 AND 365))::int AS dias_qualificacao,
        round(avg(negociacao_dias)   FILTER (WHERE negociacao_dias   BETWEEN 0.01 AND 365))::int AS dias_negociacao,
        round(avg(captado_dias)      FILTER (WHERE captado_dias      BETWEEN 0.01 AND 365))::int AS dias_captado
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
    `,

    sql`
      SELECT COALESCE(NULLIF(BTRIM(motivo_nao_captacao), ''), 'Sem registro') AS motivo, count(*)::int AS total
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND fase_atual = 'Não Captado'
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT COALESCE(fase_atual, 'Sem fase') AS fase, count(*)::int AS cards
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        COALESCE(bairro, 'Sem bairro') AS bairro,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual = 'Captado')::int AS captados,
        round(avg(valor_estimado) FILTER (WHERE valor_estimado > 0))::int AS valor_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${tipo} = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        COALESCE(tipo_imovel, 'N/D') AS tipo,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual = 'Captado')::int AS captados,
        round(avg(valor_estimado) FILTER (WHERE valor_estimado > 0))::int AS valor_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Captado')::int AS captados,
        round(avg(valor_estimado) FILTER (WHERE valor_estimado > 0))::int AS ticket_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 1
    `,

    sql`
      SELECT
        COALESCE(NULLIF(BTRIM(origem_oportunidade), ''), 'Sem origem') AS origem,
        count(*)::int AS total,
        count(*) FILTER (WHERE fase_atual = 'Captado')::int AS captados
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        array_agg(DISTINCT bairro      ORDER BY bairro)      FILTER (WHERE bairro      IS NOT NULL) AS bairros,
        array_agg(DISTINCT tipo_imovel ORDER BY tipo_imovel) FILTER (WHERE tipo_imovel IS NOT NULL) AS tipos
      FROM pipefy_captacoes
    `,

    // Anúncios ativos no mercado (imoveis_todos) nas regiões do funil. cidade = RA (slug);
    // normaliza (sem acento/caixa/separador) pra casar "lago-sul" com "Lago Sul" do Pipefy.
    sql`
      SELECT count(*)::int AS total
      FROM imoveis_todos it
      WHERE it.ativo
        AND lower(regexp_replace(translate(it.cidade, 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc'), '[^A-Za-z0-9]', '', 'g')) IN (
          SELECT lower(regexp_replace(translate(bairro, 'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc'), '[^A-Za-z0-9]', '', 'g'))
          FROM pipefy_captacoes
          WHERE bairro IS NOT NULL
            AND (${bairro} = 'Todos' OR bairro = ${bairro})
        )
    `,
  ])

  const f = filtrosRow[0] as { bairros: string[] | null; tipos: string[] | null }

  return Response.json({
    stats:          statsRows[0],
    motivos:        motivosRows,
    fases:          fasesRows,
    porBairro:      porBairroRows,
    porTipo:        porTipoRows,
    porMes:         porMesRows,
    origem:         origemRows,
    anunciosAtivos: (anunciosRow[0] as { total: number })?.total ?? 0,
    bairros:        ['Todos', ...(f?.bairros ?? [])],
    tipos:          ['Todos', ...(f?.tipos   ?? [])],
  })
}
