import { NextRequest, NextResponse } from 'next/server'
import { lookupCPF, lookupCNPJ } from '@/lib/cpf-lookup'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string }
    if (!query) return NextResponse.json({ error: 'query obrigatório' }, { status: 400 })

    const digits = query.replace(/\D/g, '')

    if (digits.length === 11) {
      const data = await lookupCPF(digits)
      return NextResponse.json({ type: 'cpf', data })
    }

    if (digits.length === 14) {
      const data = await lookupCNPJ(digits)
      return NextResponse.json({ type: 'cnpj', data })
    }

    return NextResponse.json({ error: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos)' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
