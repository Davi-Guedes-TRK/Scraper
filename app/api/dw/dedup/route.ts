import { NextRequest, NextResponse } from 'next/server'
import { buscarImovelNoDw, buscarPessoaNoDw } from '@/lib/dw-dedup'

export const runtime = 'nodejs'
export const maxDuration = 15

// POST { endereco? } → dedup de imóvel no espelho do dw_trk (gate antes da ônus)
// POST { nome? }     → lookup de proprietário por nome (Nido não tem CPF)
export async function POST(req: NextRequest) {
  let body: { endereco?: string; nome?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!body.endereco && !body.nome) {
    return NextResponse.json({ error: 'Informe endereco ou nome' }, { status: 400 })
  }

  try {
    const [imovel, pessoa] = await Promise.all([
      body.endereco ? buscarImovelNoDw(body.endereco) : null,
      body.nome ? buscarPessoaNoDw(body.nome) : null,
    ])
    return NextResponse.json({ imovel, pessoa })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
