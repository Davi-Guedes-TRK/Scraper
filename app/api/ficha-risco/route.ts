import { NextRequest, NextResponse } from 'next/server'
import { fichaRisco } from '@/lib/ficha-risco'

export const runtime = 'nodejs'
export const maxDuration = 20

// POST { lat, lng } → ficha de risco geológico do ponto (cartas SGB/CPRM).
export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (body.lat == null || body.lng == null) {
    return NextResponse.json({ error: 'lat/lng obrigatórios' }, { status: 400 })
  }
  try {
    const ficha = await fichaRisco(body.lat, body.lng)
    return NextResponse.json(ficha)
  } catch (err) {
    // degradação: falha do SGB não quebra a triagem
    return NextResponse.json(
      { riscos: [], geologia: null, nivel: 'nenhum', avaliado: false,
        erro: err instanceof Error ? err.message : 'erro' },
      { status: 200 },
    )
  }
}
