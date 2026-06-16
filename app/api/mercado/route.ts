import { NextResponse } from 'next/server'
import { carregarMercado } from '@/lib/mercado'
import { withCache } from '@/lib/redis'

export const runtime = 'nodejs'
export const maxDuration = 25
export const dynamic = 'force-dynamic'

// Dados de mercado do setor imobiliário (ações B3 + macro BCB).
// Cache 10 min: cotações mudam intradiário, mas 10min é suficiente e poupa o Yahoo.
export async function GET() {
  try {
    const data = await withCache('mercado:imobiliario', 600, carregarMercado)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
