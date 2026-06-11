import { NextRequest, NextResponse } from 'next/server'
import { rodarAuto2Oficio } from '@/lib/cartorio-auto'
import { notifyGChat } from '@/lib/gchat'

export const runtime = 'nodejs'
export const maxDuration = 300

// Gatilho automático do 2º Ofício (chamado por cron/GitHub Actions).
// Auth: header x-api-key === SCRAPER_API_KEY. Body: { dryRun?: boolean, limite?: number }.
export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  if (!process.env.SCRAPER_API_KEY || key !== process.env.SCRAPER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dryRun?: boolean; limite?: number } = {}
  try { body = await req.json() } catch { /* body opcional */ }

  try {
    const r = await rodarAuto2Oficio({ dryRun: body.dryRun, limite: body.limite })
    await notifyGChat(
      `🏛️ Auto 2º Ofício${r.dryRun ? ' (simulação)' : ''}: ` +
      `${r.resolvidosPorGeoportal} resolvidos via Geoportal · ` +
      `${r.dryRun ? r.simulados + ' a enviar' : r.enviados + ' enviados'} · ` +
      `${r.semConfianca} sem confiança · ${r.pulados} pulados ` +
      `(de ${r.candidatos2oficio} candidatos 2º ofício).`,
    ).catch(() => {})
    return NextResponse.json(r)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await notifyGChat(`⚠️ Auto 2º Ofício FALHOU: ${msg}`).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
