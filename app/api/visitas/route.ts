import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'

type VisitaRow = {
  link: string
  portal: string
  titulo: string | null
  bairro: string | null
  preco: string | null
  endereco: string | null
  maps_link: string | null
  lat: number | null
  lng: number | null
}

export async function GET() {
  const rows = await sql<VisitaRow[]>`
    SELECT link, portal, titulo, bairro, preco, endereco, maps_link, lat, lng
    FROM imoveis_todos
    WHERE status_triagem = 'para_visitar'
      AND visitado_em IS NULL
    LIMIT 1000
  `
  return Response.json(rows)
}

const ALLOWED_FIELDS = ['visitado_em', 'endereco', 'lat', 'lng', 'geocoded_em'] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

export async function PATCH(req: NextRequest) {
  let body: { link?: string; portal?: string } & Partial<Record<AllowedField, unknown>>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { link, portal, ...fields } = body
  if (!link || !portal) return Response.json({ error: 'link e portal obrigatórios' }, { status: 400 })
  if (!portalKeys.includes(portal)) return Response.json({ error: 'portal inválido' }, { status: 400 })

  const updates = ALLOWED_FIELDS.filter(k => k in fields)
  if (!updates.length) return Response.json({ error: 'Sem campos para atualizar' }, { status: 400 })

  const table = portalTable(portal)
  const vals: (string | number | null)[] = updates.map(k => (fields[k] ?? null) as string | number | null)
  const sets = updates.map((k, i) => `${k}=$${i + 1}`).join(', ')
  vals.push(link)

  try {
    await sql.unsafe(`UPDATE public."${table}" SET ${sets} WHERE link=$${updates.length + 1}`, vals)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
