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
  numero_matricula: string | null
  status_solicitacao_em: string | null
}

export async function GET() {
  const rows = await sql<RelatorioRow[]>`
    SELECT link, portal, titulo, bairro, cidade, preco, coletado_em, descricao,
           pistas_ia, status_solicitacao, status_solicitacao_em, endereco, maps_link, visitado_em,
           nome_anunciante, telefone, tipo_anunciante, tipo_imovel, creci,
           numero_matricula
    FROM imoveis_todos
    WHERE (status_triagem = 'aprovado' OR visitado_em IS NOT NULL)
      AND status_triagem IS DISTINCT FROM 'descartado'
    ORDER BY coletado_em DESC
    LIMIT 1000
  `
  return Response.json(rows)
}

type PatchBody =
  | { action: 'status_solicitacao'; byPortal: Record<string, string[]>; status: string }
  | { action: 'endereco'; link: string; portal: string; endereco: string }
  | { action: 'matricula'; link: string; portal: string; numero_matricula: string }

export async function PATCH(req: NextRequest) {
  let body: PatchBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (body.action === 'status_solicitacao') {
    const allowed = ['enviado', 'recebido', 'completo']
    if (!allowed.includes(body.status)) return Response.json({ error: 'status inválido' }, { status: 400 })

    try {
      await Promise.all(
        Object.entries(body.byPortal).map(([portal, links]) => {
          if (!portalKeys.includes(portal) || !links.length) return Promise.resolve()
          return sql.unsafe(
            `UPDATE public."${portalTable(portal)}" SET status_solicitacao=$1, status_solicitacao_em=NOW() WHERE link = ANY($2)`,
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

  if (body.action === 'matricula') {
    if (!body.link || !body.portal || body.numero_matricula === undefined) {
      return Response.json({ error: 'link, portal e numero_matricula obrigatórios' }, { status: 400 })
    }
    if (!portalKeys.includes(body.portal)) return Response.json({ error: 'portal inválido' }, { status: 400 })

    try {
      // Ao registrar uma matrícula real, o pedido foi atendido → status 'recebido'.
      // 'N/A' (desistimos) não mexe no status.
      await sql.unsafe(
        `UPDATE public."${portalTable(body.portal)}"
            SET numero_matricula      = $1,
                status_solicitacao    = CASE WHEN $1 <> 'N/A' THEN 'recebido' ELSE status_solicitacao END,
                status_solicitacao_em = CASE WHEN $1 <> 'N/A' THEN NOW() ELSE status_solicitacao_em END
          WHERE link=$2`,
        [body.numero_matricula, body.link],
      )
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'action inválida' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  let body: { byPortal?: Record<string, string[]> }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const byPortal = body.byPortal ?? {}
  const portals = Object.keys(byPortal).filter(p => portalKeys.includes(p) && byPortal[p]?.length)
  if (!portals.length) return Response.json({ error: 'nada para descartar' }, { status: 400 })

  // Soft delete: marca status_triagem='descartado' (convenção do projeto; reversível).
  // Não deleta a linha nem mexe em visitado_em (coluna ausente em algumas tabelas-base).
  try {
    const results = await Promise.all(
      portals.map(p =>
        sql.unsafe(`UPDATE public."${portalTable(p)}" SET status_triagem = 'descartado' WHERE link = ANY($1)`, [byPortal[p]]),
      ),
    )
    const descartados = results.reduce((n, r) => n + ((r as unknown as { count?: number }).count ?? 0), 0)
    return Response.json({ ok: true, descartados })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
  }
}
