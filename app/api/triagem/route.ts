import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCache, invalidateCache } from '@/lib/redis'
import { parseLatLng } from '@/lib/formatters'
import { portalTable, portalKeys } from '@/lib/portals'

const CACHE_KEY = 'triagem:pendentes'
const CACHE_TTL = 120  // 2 min
const CUTOFF_DAYS = 30

type ImovelRow = {
  link: string
  portal: string
  titulo: string | null
  preco: string | null
  bairro: string | null
  cidade: string | null
  area_m2: string | null
  quartos: string | null
  imagens: string | null
  coletado_em: string | null
  data_publicacao: string | null
  pistas_ia: Record<string, unknown> | null
  tipo_imovel: string | null
  creci: string | null
  nome_anunciante: string | null
  tipo_anunciante: string | null
}

export async function GET() {
  const items = await withCache<ImovelRow[]>(CACHE_KEY, CACHE_TTL, async () => {
    return sql<ImovelRow[]>`
      SELECT link, portal, titulo, preco, bairro, cidade, area_m2, quartos,
             imagens, coletado_em, data_publicacao, pistas_ia,
             tipo_imovel, creci, nome_anunciante, tipo_anunciante
      FROM imoveis_todos
      WHERE status_triagem = 'pendente'
        AND (creci IS NULL OR creci != '22784')
        AND coletado_em >= NOW() - (${CUTOFF_DAYS} || ' days')::interval
      ORDER BY coletado_em DESC
      LIMIT 2000
    `
  })
  return Response.json(items)
}

export async function PATCH(req: NextRequest) {
  let body: { link?: string; portal?: string; status?: string; endereco?: string; maps_link?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { link, portal, status, endereco, maps_link } = body

  if (!link || !portal || !status) {
    return Response.json({ error: 'link, portal e status são obrigatórios' }, { status: 400 })
  }

  const allowedStatus = ['aprovado', 'para_visitar', 'descartado']
  if (!allowedStatus.includes(status)) {
    return Response.json({ error: 'status inválido' }, { status: 400 })
  }

  if (!portalKeys.includes(portal)) {
    return Response.json({ error: 'portal inválido' }, { status: 400 })
  }

  const table = portalTable(portal)

  try {
    if (['aprovado', 'para_visitar'].includes(status) && maps_link) {
      const geo = parseLatLng(maps_link)
      if (geo) {
        await sql.unsafe(
          `UPDATE public."${table}" SET status_triagem=$1, endereco=$2, maps_link=$3, lat=$4, lng=$5, geocoded_em=NOW() WHERE link=$6`,
          [status, endereco ?? null, maps_link, geo.lat, geo.lng, link],
        )
      } else {
        await sql.unsafe(
          `UPDATE public."${table}" SET status_triagem=$1, endereco=$2, maps_link=$3 WHERE link=$4`,
          [status, endereco ?? null, maps_link, link],
        )
      }
    } else {
      await sql.unsafe(
        `UPDATE public."${table}" SET status_triagem=$1, endereco=$2 WHERE link=$3`,
        [status, endereco ?? null, link],
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro no banco'
    return Response.json({ error: msg }, { status: 500 })
  }

  await invalidateCache(CACHE_KEY)
  return Response.json({ ok: true })
}
