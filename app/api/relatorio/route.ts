import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'

type RelatorioRow = {
  link: string
  portal: string
  titulo: string | null
  bairro: string | null
  cidade: string | null
  preco: string | null
  coletado_em: string | null
  descricao: string | null
  pistas_ia: Record<string, unknown> | null
  status_solicitacao: string | null
  endereco: string | null
  maps_link: string | null
  visitado_em: string | null
  nome_anunciante: string | null
  telefone: string | null
  tipo_anunciante: string | null
  tipo_imovel: string | null
  creci: string | null
}

export async function GET() {
  const rows = await sql<RelatorioRow[]>`
    SELECT link, portal, titulo, bairro, cidade, preco, coletado_em, descricao,
           pistas_ia, status_solicitacao, endereco, maps_link, visitado_em,
           nome_anunciante, telefone, tipo_anunciante, tipo_imovel, creci
    FROM imoveis_todos
    WHERE status_triagem = 'aprovado' OR visitado_em IS NOT NULL
    ORDER BY coletado_em DESC
    LIMIT 1000
  `
  return Response.json(rows)
}

type PatchBody =
  | { action: 'status_solicitacao'; byPortal: Record<string, string[]>; status: string }
  | { action: 'endereco'; link: string; portal: string; endereco: string }

export async function PATCH(req: NextRequest) {
  let body: PatchBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (body.action === 'status_solicitacao') {
    const allowed = ['enviado', 'recebido']
    if (!allowed.includes(body.status)) return Response.json({ error: 'status inválido' }, { status: 400 })

    try {
      await Promise.all(
        Object.entries(body.byPortal).map(([portal, links]) => {
          if (!portalKeys.includes(portal) || !links.length) return Promise.resolve()
          return sql.unsafe(
            `UPDATE public."${portalTable(portal)}" SET status_solicitacao=$1 WHERE link = ANY($2)`,
            [body.status, links],
          )
        }),
      )
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  if (body.action === 'endereco') {
    if (!body.link || !body.portal || body.endereco === undefined) {
      return Response.json({ error: 'link, portal e endereco obrigatórios' }, { status: 400 })
    }
    if (!portalKeys.includes(body.portal)) return Response.json({ error: 'portal inválido' }, { status: 400 })

    try {
      await sql.unsafe(
        `UPDATE public."${portalTable(body.portal)}" SET endereco=$1 WHERE link=$2`,
        [body.endereco, body.link],
      )
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'action inválida' }, { status: 400 })
}
