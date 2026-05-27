import { NextRequest } from 'next/server'
import sql from '@/lib/db'

function resolverDesde(range: string): string {
  const d = new Date()
  if (range === '7d')  { d.setDate(d.getDate() - 7);   return d.toISOString().slice(0, 10) }
  if (range === '30d') { d.setDate(d.getDate() - 30);  return d.toISOString().slice(0, 10) }
  if (range === '90d') { d.setDate(d.getDate() - 90);  return d.toISOString().slice(0, 10) }
  if (range === 'ano') { return `${d.getFullYear()}-01-01` }
  return '2024-01-01'
}

const CAPTADOS_FASES = ['Fechado Comercialmente', 'Captação Realizada ✅', 'Ônus Solicitada', 'Matricula Solicitada']
const ENCERRADAS_FASES = ['Não Captado ❌', 'Captação Realizada ✅', 'Fechado Comercialmente', 'Matricula Solicitada', 'Ônus Solicitada', 'Locado / Retirado']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bairro = searchParams.get('bairro')      ?? 'Todos'
  const tipo   = searchParams.get('tipo_imovel') ?? 'Todos'
  const desde  = resolverDesde(searchParams.get('range') ?? 'tudo')

  const [statsRows, motivosRows, fasesRows, porBairroRows, porTipoRows, porMesRows, origemRows, filtrosRow, finRows] = await Promise.all([

    sql`
      SELECT
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE telefone_contato IS NOT NULL OR outros_contatos IS NOT NULL)::int AS leads,
        count(*) FILTER (WHERE visita_agendada IS NOT NULL OR visita_entrada IS NOT NULL OR obs_visita IS NOT NULL)::int AS visitados,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados,
        round(count(*) FILTER (WHERE fase_atual = 'Não Captado ❌') * 100.0 / NULLIF(count(*), 0), 1)::float AS taxa_perda,
        count(*) FILTER (WHERE fase_atual NOT IN ('Não Captado ❌','Captação Realizada ✅','Fechado Comercialmente','Matricula Solicitada','Ônus Solicitada','Locado / Retirado'))::int AS em_andamento
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
    `,

    sql`
      SELECT COALESCE(motivo_nao_captacao, 'Sem registro') AS motivo, count(*)::int AS total
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde} AND fase_atual = 'Não Captado ❌'
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT COALESCE(fase_atual, 'Sem fase') AS fase, count(*)::int AS cards
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        COALESCE(bairro, 'Sem bairro') AS bairro,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado ❌')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados,
        round(avg(valor_anuncio) FILTER (WHERE valor_anuncio > 0))::int AS valor_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${tipo} = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        COALESCE(tipo_imovel, 'N/D') AS tipo,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado ❌')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados,
        round(avg(valor_anuncio) FILTER (WHERE valor_anuncio > 0))::int AS valor_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
      GROUP BY 1 ORDER BY 2 DESC
    `,

    sql`
      SELECT
        to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados,
        round(avg(valor_anuncio) FILTER (WHERE valor_anuncio > 0))::int AS ticket_medio
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 1
    `,

    sql`
      SELECT
        CASE
          WHEN links_anuncio ILIKE '%dfimoveis%' THEN 'DFImóveis'
          WHEN links_anuncio ILIKE '%wimoveis%'  THEN 'WImóveis'
          WHEN links_anuncio ILIKE '%olx%'       THEN 'OLX'
          WHEN links_anuncio ILIKE '%facebook%'  THEN 'Facebook'
          WHEN links_anuncio ILIKE '%nidos%'     THEN 'Nidos'
          WHEN links_anuncio IS NOT NULL          THEN 'Outro'
          ELSE 'Sem link'
        END AS origem,
        count(*)::int AS total,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
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

    sql`
      SELECT
        round(sum(valor_anuncio) FILTER (WHERE fase_atual IN ('Fechado Comercialmente','Captação Realizada ✅','Ônus Solicitada','Matricula Solicitada')))::int           AS carteira_captada,
        round(avg(valor_anuncio) FILTER (WHERE fase_atual IN ('Fechado Comercialmente','Captação Realizada ✅','Ônus Solicitada','Matricula Solicitada')))::int           AS ticket_medio_captados,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente','Captação Realizada ✅','Ônus Solicitada','Matricula Solicitada'))::int                           AS qtd_captados_com_valor,
        round(sum(valor_anuncio) FILTER (WHERE fase_atual NOT IN ('Não Captado ❌','Captação Realizada ✅','Fechado Comercialmente','Matricula Solicitada','Ônus Solicitada','Locado / Retirado')))::int AS potencial_pipeline,
        round(avg(valor_anuncio) FILTER (WHERE valor_anuncio > 0))::int                                                                                                AS ticket_medio_geral,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY valor_anuncio) FILTER (WHERE valor_anuncio IS NOT NULL AND valor_anuncio > 0))::int                           AS mediana_anuncio,
        count(*) FILTER (WHERE valor_anuncio BETWEEN 0.01 AND 9999)::int   AS faixa_0_10k,
        count(*) FILTER (WHERE valor_anuncio BETWEEN 10000 AND 19999)::int AS faixa_10_20k,
        count(*) FILTER (WHERE valor_anuncio BETWEEN 20000 AND 29999)::int AS faixa_20_30k,
        count(*) FILTER (WHERE valor_anuncio BETWEEN 30000 AND 49999)::int AS faixa_30_50k,
        count(*) FILTER (WHERE valor_anuncio >= 50000)::int                 AS faixa_50k_plus,
        round(avg(leads_dias)       FILTER (WHERE leads_dias       BETWEEN 0.01 AND 365))::int AS dias_leads,
        round(avg(em_contato_dias)  FILTER (WHERE em_contato_dias  BETWEEN 0.01 AND 365))::int AS dias_contato,
        round(avg(visita_dias)      FILTER (WHERE visita_dias      BETWEEN 0.01 AND 365))::int AS dias_visita,
        round(avg(fechado_dias)     FILTER (WHERE fechado_dias     BETWEEN 0.01 AND 365))::int AS dias_fechado
      FROM pipefy_captacoes
      WHERE criado_em >= ${desde}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
    `,
  ])

  const f = filtrosRow[0] as { bairros: string[] | null; tipos: string[] | null }

  return Response.json({
    stats:      statsRows[0],
    motivos:    motivosRows,
    fases:      fasesRows,
    porBairro:  porBairroRows,
    porTipo:    porTipoRows,
    porMes:     porMesRows,
    origem:     origemRows,
    financeiro: finRows[0] ?? null,
    bairros:    ['Todos', ...(f?.bairros ?? [])],
    tipos:      ['Todos', ...(f?.tipos   ?? [])],
  })
}
