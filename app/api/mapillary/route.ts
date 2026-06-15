import { NextRequest, NextResponse } from 'next/server'
import { buscarImagensMapillary } from '@/lib/mapillary'

export const runtime = 'nodejs'
export const maxDuration = 12

// POST { lat, lng } → { imagens[], semToken } — street-level perto do ponto.
export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (body.lat == null || body.lng == null) {
    return NextResponse.json({ error: 'lat/lng obrigatórios' }, { status: 400 })
  }
  const imagens = await buscarImagensMapillary(body.lat, body.lng)
  return NextResponse.json({ imagens, semToken: !process.env.MAPILLARY_TOKEN })
}
