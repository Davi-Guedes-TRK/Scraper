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
  sem_exclusividade: boolean | null
  grupo_id: string | null
}

type TriagemResponse = { items: ImovelRow[]; total: number }

export async function GET() {
  const data = await withCache<TriagemResponse>(CACHE_KEY, CACHE_TTL, async () => {
    const [items, countRows] = await Promise.all([
      sql<ImovelRow[]>`
        SELECT link, portal, titulo, preco, bairro, cidade, area_m2, quartos,
               imagens, coletado_em, data_publicacao, pistas_ia,
               tipo_imovel, creci, nome_anunciante, tipo_anunciante,
               sem_exclusividade, grupo_id
        FROM imoveis_todos
        WHERE status_triagem = 'pendente'
          AND (creci IS NULL OR creci NOT IN ('22784', '33410'))
          -- TRK administra LOCAÇÃO: fora anúncios de venda (por tipo ou tipo_imovel)
          AND coalesce(tipo, '') NOT ILIKE 'venda'
          AND coalesce(tipo_imovel, '') NOT ILIKE 'venda%'
          AND coletado_em >= NOW() - (${CUTOFF_DAYS} || ' days')::interval
        ORDER BY coletado_em DESC
        LIMIT 5000
      `,
      sql<[{ total: number }]>`
        SELECT count(*)::int AS total
        FROM imoveis_todos
        WHERE status_triagem = 'pendente'
          AND (creci IS NULL OR creci NOT IN ('22784', '33410'))
          AND coalesce(tipo, '') NOT ILIKE 'venda'
          AND coalesce(tipo_imovel, '') NOT ILIKE 'venda%'
          AND coletado_em >= NOW() - (${CUTOFF_DAYS} || ' days')::interval
      `,
    ])
    return { items, total: countRows[0]?.total ?? items.length }
  })
  return Response.json(data)
}

export async function PATCH(req: NextRequest) {
  let body: { link?: string; portal?: string; status?: string; endereco?: string; maps_link?: string; endereco_fonte?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { link, portal, status, endereco, maps_link, endereco_fonte } = body

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
          `UPDATE public."${table}" SET status_triagem=$1, endereco=$2, maps_link=$3, lat=$4, lng=$5, geocoded_em=NOW(), endereco_fonte=$6 WHERE link=$7`,
          [status, endereco ?? null, maps_link, geo.lat, geo.lng, endereco_fonte ?? null, link],
        )
      } else {
        await sql.unsafe(
          `UPDATE public."${table}" SET status_triagem=$1, endereco=$2, maps_link=$3, endereco_fonte=$4 WHERE link=$5`,
          [status, endereco ?? null, maps_link, endereco_fonte ?? null, link],
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
