import { NextRequest, NextResponse } from 'next/server'
import { extractPistas } from '@/lib/extrair-pistas'

export async function POST(req: NextRequest) {
  const body = await req.json() as { descricao?: string; imagens?: string }
  if (!body.descricao?.trim() && !body.imagens) {
    return NextResponse.json({ error: 'Forneça descricao ou imagens.' }, { status: 400 })
  }
  try {
    const pistas = await extractPistas(body.descricao, body.imagens)
    return NextResponse.json({ pistas })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
