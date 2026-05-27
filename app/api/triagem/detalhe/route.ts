import { NextRequest } from 'next/server'
import sql from '@/lib/db'

type DetalheRow = {
  link: string
  descricao: string | null
}

export async function GET(req: NextRequest) {
  const link = req.nextUrl.searchParams.get('link')
  if (!link) {
    return Response.json({ error: 'link obrigatório' }, { status: 400 })
  }

  const rows = await sql<DetalheRow[]>`
    SELECT link, descricao
    FROM imoveis_todos
    WHERE link = ${link}
    LIMIT 1
  `

  if (!rows.length) {
    return Response.json({ error: 'não encontrado' }, { status: 404 })
  }

  return Response.json(rows[0])
}
