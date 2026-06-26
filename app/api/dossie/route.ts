import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Pessoa = { codigo_pessoa: string; nome?: string | null }

// Seleção de proprietários na tela /proprietarios → fila de dossiê.
// O dossiê em si é gerado ON-PREM (scripts/dossie_proprietario.mjs --fila),
// porque só a máquina do Davi alcança o dw_trk (Nido, rede local).
export async function POST(req: NextRequest) {
  let body: { pessoas?: Pessoa[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const pessoas = (body.pessoas ?? []).filter(p => p.codigo_pessoa)
  if (!pessoas.length) return NextResponse.json({ error: 'nenhum proprietário selecionado' }, { status: 400 })

  let enfileirados = 0
  try {
    for (const p of pessoas) {
      await sql`
        INSERT INTO public.dossie_fila (codigo_pessoa, nome, status)
        VALUES (${p.codigo_pessoa}, ${p.nome ?? null}, 'pendente')
        ON CONFLICT (codigo_pessoa) DO UPDATE SET status = 'pendente', erro = NULL, criado_em = now()
      `
      enfileirados++
    }
    return NextResponse.json({ ok: true, enfileirados, total: pessoas.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro no banco' }, { status: 500 })
  }
}

// GET sem params → status da fila (pra UI). GET ?codigo=X → markdown do dossiê pronto.
export async function GET(req: NextRequest) {
  const cod = req.nextUrl.searchParams.get('codigo')
  try {
    if (cod) {
      const [row] = await sql`
        SELECT codigo_pessoa, nome, markdown, gerado_em
        FROM public.dossie_proprietario WHERE codigo_pessoa = ${cod}`
      return NextResponse.json(row ?? null)
    }
    const rows = await sql`
      SELECT f.codigo_pessoa, f.nome, f.status, f.erro, f.criado_em, f.gerado_em,
             (d.codigo_pessoa IS NOT NULL) AS tem_dossie
      FROM public.dossie_fila f
      LEFT JOIN public.dossie_proprietario d ON d.codigo_pessoa = f.codigo_pessoa
      ORDER BY f.criado_em DESC LIMIT 500`
    return NextResponse.json(rows)
  } catch (e) {
    // tabela ainda não criada / outro erro → devolve vazio pra UI não quebrar
    return NextResponse.json(cod ? null : [], { status: 200 })
  }
}
