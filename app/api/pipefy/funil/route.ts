import { NextRequest } from 'next/server'
import sql from '@/lib/db'

const DESDE = '2024-01-01'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bairro = searchParams.get('bairro') ?? 'Todos'
  const tipo   = searchParams.get('tipo_imovel') ?? 'Todos'

  const [statsRows, motivosRows, fasesRows, porBairroRows, porTipoRows, porMesRows, filtrosRow] = await Promise.all([
    sql`
      SELECT
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE telefone_contato IS NOT NULL OR outros_contatos IS NOT NULL)::int AS leads,
        count(*) FILTER (WHERE visita_agendada IS NOT NULL OR visita_entrada IS NOT NULL OR obs_visita IS NOT NULL)::int AS visitados,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados,
        round(count(*) FILTER (WHERE fase_atual = 'Não Captado ❌') * 100.0 / NULLIF(count(*), 0), 1)::float AS taxa_perda,
        count(*) FILTER (WHERE fase_atual NOT IN ('Não Captado ❌','Captação Realizada ✅','Fechado Comercialmente','Matricula Solicitada','Ônus Solicitada','Locado / Retirado'))::int AS em_andamento
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
    `,
    sql`
      SELECT COALESCE(motivo_nao_captacao, 'Sem registro') AS motivo, count(*)::int AS total
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE} AND fase_atual = 'Não Captado ❌'
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,
    sql`
      SELECT COALESCE(fase_atual, 'Sem fase') AS fase, count(*)::int AS cards
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,
    sql`
      SELECT COALESCE(bairro, 'Sem bairro') AS bairro,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado ❌')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE}
        AND (${tipo} = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,
    sql`
      SELECT COALESCE(tipo_imovel, 'N/D') AS tipo,
        count(*)::int AS oportunidades,
        count(*) FILTER (WHERE fase_atual = 'Não Captado ❌')::int AS perdidos,
        count(*) FILTER (WHERE fase_atual IN ('Fechado Comercialmente', 'Captação Realizada ✅'))::int AS captados
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
      GROUP BY 1 ORDER BY 2 DESC
    `,
    sql`
      SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes, count(*)::int AS oportunidades
      FROM pipefy_captacoes
      WHERE criado_em >= ${DESDE}
        AND (${bairro} = 'Todos' OR bairro = ${bairro})
        AND (${tipo}   = 'Todos' OR tipo_imovel = ${tipo})
      GROUP BY 1 ORDER BY 1
    `,
    sql`
      SELECT
        array_agg(DISTINCT bairro      ORDER BY bairro)      FILTER (WHERE bairro      IS NOT NULL) AS bairros,
        array_agg(DISTINCT tipo_imovel ORDER BY tipo_imovel) FILTER (WHERE tipo_imovel IS NOT NULL) AS tipos
      FROM pipefy_captacoes
    `,
  ])

  const f = filtrosRow[0] as { bairros: string[] | null; tipos: string[] | null }

  return Response.json({
    stats:     statsRows[0],
    motivos:   motivosRows,
    fases:     fasesRows,
    porBairro: porBairroRows,
    porTipo:   porTipoRows,
    porMes:    porMesRows,
    bairros:   ['Todos', ...(f?.bairros ?? [])],
    tipos:     ['Todos', ...(f?.tipos   ?? [])],
  })
}
