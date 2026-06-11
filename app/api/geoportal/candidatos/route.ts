import { NextRequest, NextResponse } from 'next/server'
import { acharCandidatos } from '@/lib/geoportal-candidates'

export const runtime = 'nodejs'
export const maxDuration = 20

// POST { lat?, lng?, quadra?, conjunto?, setor?, endereco?, area_m2? }
// → { candidatos[], melhor, confianca }
// Traz os lotes prováveis do IDE-DF para um endereço impreciso e os ranqueia.
export async function POST(req: NextRequest) {
  let body: {
    lat?: number; lng?: number
    quadra?: string; conjunto?: string; setor?: string; casa_lote?: string
    endereco?: string; area_m2?: number
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const temPonto  = body.lat != null && body.lng != null
  const temPistas = !!(body.quadra || body.conjunto || body.setor)
  if (!temPonto && !temPistas) {
    return NextResponse.json({ error: 'Informe lat/lng ou quadra/conjunto/setor' }, { status: 400 })
  }

  try {
    const r = await acharCandidatos(body)
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
