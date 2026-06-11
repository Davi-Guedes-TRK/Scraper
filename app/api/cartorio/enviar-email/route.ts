import { NextRequest, NextResponse } from 'next/server'
import { solicitarMatriculas } from '@/lib/cartorio-envio'

// Envio manual a partir da UI do relatório (sem gate). A lógica vive em
// lib/cartorio-envio (compartilhada com o gatilho automático /api/cartorio/auto).
export async function POST(req: NextRequest) {
  let body: { links?: string[]; auto?: boolean; dryRun?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { links, auto = false, dryRun = false } = body
  if (!Array.isArray(links) || !links.length) {
    return NextResponse.json({ error: 'links[] obrigatório' }, { status: 400 })
  }

  try {
    const r = await solicitarMatriculas(links, { auto, dryRun })
    // Mantém compat com a UI (espera totalEnviado).
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: `Erro: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }
}
