import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { portalKeys } from '@/lib/portals'

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

  const logs = await sql<ScraperLog[]>`
    SELECT * FROM scraper_logs
    WHERE portal = ${portal}
    ORDER BY created_at DESC
    LIMIT 20
  `
  return Response.json(logs)
}
