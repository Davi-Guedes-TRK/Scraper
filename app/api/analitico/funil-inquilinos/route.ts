import { NextRequest } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

// Funil de inquilinos (lado da demanda, Nido): Atendimento (LOCAÇÃO) → Com Proposta → Fechado.
// Lê funil_inquilinos (materializado de nido_atendimentos por scripts/sync_funil_inquilinos.py).

function resolverDesde(range: string): string {
  const d = new Date()
  if (range === '7d')  { d.setDate(d.getDate() - 7);  return d.toISOString().slice(0, 10) }
  if (range === '30d') { d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }
  if (range === '90d') { d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10) }
  if (range === 'ano') { return `${d.getFullYear()}-01-01` }
  return '2024-01-01'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const regiao = searchParams.get('regiao') ?? 'Todos'
  const tipo   = searchParams.get('tipo')   ?? 'Todos'
  const desde  = searchParams.get('desde') || resolverDesde(searchParams.get('range') ?? 'tudo')
  const ate    = searchParams.get('ate')   || new Date().toISOString().slice(0, 10)

  const [statsRows, motivosRows, canalRows, porRegiaoRows, porTipoRows, porMesRows, filtrosRow] = await Promise.all([
    sql`
      SELECT
        count(*)::int AS atendimentos,
        count(*) FILTER (WHERE tem_proposta)::int AS com_proposta,
        count(*) FILTER (WHERE situacao = 'Fechado')::int AS fechados,
        count(*) FILTER (WHERE situacao = 'Ativo')::int AS ativos,
        count(*) FILTER (WHERE situacao IN ('Encerrado','Cancelado'))::int AS perdidos,
        round(count(*) FILTER (WHERE situacao IN ('Encerrado','Cancelado')) * 100.0 / NULLIF(count(*),0), 1)::float AS taxa_perda
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${regiao} = 'Todos' OR regiao = ${regiao})
        AND (${tipo}   = 'Todos' OR tipo   = ${tipo})
    `,
    sql`
      SELECT COALESCE(NULLIF(BTRIM(motivo), ''), 'Sem registro') AS motivo, count(*)::int AS total
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND situacao IN ('Encerrado','Cancelado')
        AND (${regiao} = 'Todos' OR regiao = ${regiao})
        AND (${tipo}   = 'Todos' OR tipo   = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `,
    sql`
      SELECT COALESCE(NULLIF(BTRIM(canal), ''), 'Sem canal') AS canal, count(*)::int AS total,
             count(*) FILTER (WHERE situacao = 'Fechado')::int AS fechados
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${regiao} = 'Todos' OR regiao = ${regiao})
        AND (${tipo}   = 'Todos' OR tipo   = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC
    `,
    sql`
      SELECT COALESCE(regiao, 'Sem região') AS regiao, count(*)::int AS atendimentos,
             count(*) FILTER (WHERE tem_proposta)::int AS com_proposta,
             count(*) FILTER (WHERE situacao = 'Fechado')::int AS fechados
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${tipo} = 'Todos' OR tipo = ${tipo})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 12
    `,
    sql`
      SELECT COALESCE(tipo, 'N/D') AS tipo, count(*)::int AS atendimentos,
             count(*) FILTER (WHERE situacao = 'Fechado')::int AS fechados
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${regiao} = 'Todos' OR regiao = ${regiao})
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `,
    sql`
      SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
             count(*)::int AS atendimentos,
             count(*) FILTER (WHERE situacao = 'Fechado')::int AS fechados
      FROM funil_inquilinos
      WHERE criado_em >= ${desde} AND criado_em < (${ate}::date + INTERVAL '1 day')
        AND (${regiao} = 'Todos' OR regiao = ${regiao})
        AND (${tipo}   = 'Todos' OR tipo   = ${tipo})
      GROUP BY 1 ORDER BY 1
    `,
    sql`
      SELECT array_agg(DISTINCT regiao ORDER BY regiao) FILTER (WHERE regiao IS NOT NULL) AS regioes,
             array_agg(DISTINCT tipo   ORDER BY tipo)   FILTER (WHERE tipo   IS NOT NULL) AS tipos
      FROM funil_inquilinos
    `,
  ])

  const f = filtrosRow[0] as { regioes: string[] | null; tipos: string[] | null }

  return Response.json({
    stats:     statsRows[0],
    motivos:   motivosRows,
    canal:     canalRows,
    porRegiao: porRegiaoRows,
    porTipo:   porTipoRows,
    porMes:    porMesRows,
    regioes:   ['Todos', ...(f?.regioes ?? [])],
    tipos:     ['Todos', ...(f?.tipos   ?? [])],
  })
}
