import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Item = {
  codigo_imovel?: string; proprietario?: string | null; telefone?: string | null
  tipo_imovel?: string | null; bairro?: string | null; endereco?: string | null
  valor_locacao?: number | null; dias_inativo?: number | null
}

// Curadoria: imóveis escolhidos no "Alugamos não Adm" entram na fila de Oportunidades.
// A criação do card no Pipefy ("COM - Oportunidades") é feita on-prem via sessão (sem API).
export async function POST(req: NextRequest) {
  let body: { imoveis?: Item[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const imoveis = (body.imoveis ?? []).filter(i => i.codigo_imovel)
  if (!imoveis.length) return NextResponse.json({ error: 'nenhum imóvel selecionado' }, { status: 400 })

  let criados = 0
  try {
    for (const i of imoveis) {
      const r = await sql`
        INSERT INTO public.oportunidades_fila
          (codigo_imovel, proprietario, telefone, tipo_imovel, bairro, endereco, valor_locacao, dias_inativo, status)
        VALUES (${i.codigo_imovel!}, ${i.proprietario ?? null}, ${i.telefone ?? null}, ${i.tipo_imovel ?? null},
                ${i.bairro ?? null}, ${i.endereco ?? null}, ${i.valor_locacao ?? null}, ${i.dias_inativo ?? null}, 'pendente')
        ON CONFLICT (codigo_imovel) DO UPDATE SET status = 'pendente', criado_em = now()
        RETURNING (xmax = 0) AS is_insert
      `
      if (r[0]?.is_insert) criados++
    }
    return NextResponse.json({ ok: true, criados, total: imoveis.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro no banco' }, { status: 500 })
  }
}

// Fila atual (pro script on-prem consumir / pra UI mostrar o que já foi enviado).
export async function GET() {
  const rows = await sql`
    SELECT codigo_imovel, proprietario, status, criado_em
    FROM public.oportunidades_fila ORDER BY criado_em DESC LIMIT 1000
  `
  return NextResponse.json(rows)
}
