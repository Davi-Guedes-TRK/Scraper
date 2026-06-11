import { NextRequest, NextResponse } from 'next/server'
import { syncCardById, deleteCard } from '@/lib/pipefy-sync'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 30

// Webhook do Pipefy: dispara a cada evento de card (create/move/field_update/done/delete).
// Faz UPSERT/DELETE só daquele card em pipefy_captacoes — sync em tempo real.
// URL registrada no Pipefy inclui ?token=<SCRAPER_API_KEY>.
//
// Payload Pipefy: { data: { action: "card.create"|..., card: { id }, ... } }
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!process.env.SCRAPER_API_KEY || token !== process.env.SCRAPER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { data?: { action?: string; card?: { id?: string | number } } }
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const action = payload.data?.action ?? ''
  const cardId = payload.data?.card?.id
  if (!cardId) return NextResponse.json({ ok: true, skipped: 'sem card.id' })

  try {
    if (action === 'card.delete') {
      await deleteCard(cardId)
      await log('info', 'pipefy-webhook', 'Card removido', { cardId }).catch(() => {})
      return NextResponse.json({ ok: true, action, cardId, deleted: true })
    }
    const titulo = await syncCardById(cardId)
    await log('info', 'pipefy-webhook', 'Card sincronizado', { cardId, action, titulo }).catch(() => {})
    return NextResponse.json({ ok: true, action, cardId, titulo })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await log('error', 'pipefy-webhook', 'Falha ao sincronizar card', { cardId, action, error: msg }).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
