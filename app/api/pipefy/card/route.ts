import { NextRequest, NextResponse } from 'next/server'
import { criarCardOportunidade } from '@/lib/pipefy'

export async function POST(req: NextRequest) {
  if (!process.env.PIPEFY_TOKEN) {
    return NextResponse.json({ error: 'PIPEFY_TOKEN não configurado' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    const card = await criarCardOportunidade(body)
    return NextResponse.json({ ok: true, card_id: card.id, title: card.title, url: card.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('invalid_token') || msg.includes('401') || msg.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Token Pipefy expirado. Rode scripts/pipefy_auth_setup.py para renovar.' },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
