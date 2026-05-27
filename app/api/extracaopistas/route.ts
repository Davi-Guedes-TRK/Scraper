import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import type { Pistas } from '@/lib/extrair-pistas'

type ExtracaoRow = {
  link: string
  portal: string
  titulo: string | null
  preco: string | null
  bairro: string | null
  descricao: string | null
  imagens: string | null
  coletado_em: string | null
  pistas_ia: Pistas | null
}

export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get('tipo') ?? 'pendentes'

  if (tipo === 'processados') {
    const rows = await sql<ExtracaoRow[]>`
      SELECT link, portal, titulo, preco, bairro, descricao, imagens, coletado_em, pistas_ia
      FROM imoveis_todos
      WHERE status_triagem = 'pendente'
        AND pistas_ia IS NOT NULL
      ORDER BY coletado_em DESC
      LIMIT 50
    `
    return Response.json(rows)
  }

  const rows = await sql<ExtracaoRow[]>`
    SELECT link, portal, titulo, preco, bairro, descricao, imagens, coletado_em, pistas_ia
    FROM imoveis_todos
    WHERE status_triagem = 'pendente'
      AND pistas_ia IS NULL
    ORDER BY coletado_em DESC
    LIMIT 100
  `
  return Response.json(rows)
}

export async function PATCH(req: NextRequest) {
  let body: { link?: string; portal?: string; pistas?: Pistas }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { link, portal, pistas } = body
  if (!link || !portal || !pistas) {
    return Response.json({ error: 'link, portal e pistas obrigatórios' }, { status: 400 })
  }
  if (!portalKeys.includes(portal)) return Response.json({ error: 'portal inválido' }, { status: 400 })

  try {
    await sql.unsafe(
      `UPDATE public."${portalTable(portal)}" SET pistas_ia=$1 WHERE link=$2`,
      [JSON.stringify(pistas), link],
    )
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
