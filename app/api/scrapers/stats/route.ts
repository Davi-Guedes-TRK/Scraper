import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { portalKeys, portalTable } from '@/lib/portals'
import { startOfToday, daysAgo } from '@/lib/formatters'

type ScraperLog = {
  id: string
  portal: string
  status: string
  mensagem: string
  total_coletado: number
  created_at: string
}

export async function GET(req: NextRequest) {
  const portal = req.nextUrl.searchParams.get('portal')
  if (!portal || !portalKeys.includes(portal)) {
    return Response.json({ error: 'portal inválido' }, { status: 400 })
  }

  const table = portalTable(portal)
  const today = startOfToday()
  const d3 = daysAgo(3)

  const [lastRec, cToday, c3d, lastLog] = await Promise.all([
    sql.unsafe<{ coletado_em: string }[]>(
      `SELECT coletado_em FROM public."${table}" ORDER BY coletado_em DESC LIMIT 1`,
    ),
    sql.unsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM public."${table}" WHERE coletado_em >= $1`,
      [today],
    ),
    sql.unsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM public."${table}" WHERE coletado_em >= $1`,
      [d3],
    ),
    sql<ScraperLog[]>`
      SELECT * FROM scraper_logs WHERE portal = ${portal}
      ORDER BY created_at DESC LIMIT 1
    `,
  ])

  return Response.json({
    ultimoRegistro: lastRec[0]?.coletado_em ?? null,
    countToday: cToday[0]?.count ?? 0,
    count3d: c3d[0]?.count ?? 0,
    status: lastLog[0]?.status ?? 'desconhecido',
    ultimoLog: lastLog[0] ?? null,
  })
}
