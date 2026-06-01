import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { lancamentoFontes } from '@/lib/portals'

type Empreendimento = {
  fonte: string
  slug: string
  nome: string | null
  url: string | null
  tipo: string | null
  status: string | null
  pct_obras: number | null
  bairro: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  area_min_m2: number | null
  area_max_m2: number | null
  total_unidades: number | null
  suites_max: number | null
  vagas_min: number | null
  vagas_max: number | null
  preco_min: number | null
  preco_max: number | null
  tipologias: unknown
  diferenciais: string[] | null
  descricao: string | null
  scraped_at: string | null
}

type FonteStats = {
  fonte: string
  total: number
  ultimo: string | null
}

export async function GET(req: NextRequest) {
  const fonte = req.nextUrl.searchParams.get('fonte')
  const bairro = req.nextUrl.searchParams.get('bairro')
  const status = req.nextUrl.searchParams.get('status')

  if (fonte && !lancamentoFontes.includes(fonte)) {
    return Response.json({ error: 'fonte inválida' }, { status: 400 })
  }

  const [items, stats] = await Promise.all([
    sql<Empreendimento[]>`
      SELECT fonte, slug, nome, url, tipo, status, pct_obras,
             bairro, endereco, cidade, estado,
             area_min_m2, area_max_m2,
             total_unidades, suites_max, vagas_min, vagas_max,
             preco_min, preco_max,
             tipologias, diferenciais, descricao,
             scraped_at
      FROM empreendimentos_all
      WHERE (${fonte}::text IS NULL OR fonte = ${fonte})
        AND (${bairro}::text IS NULL OR LOWER(bairro) = LOWER(${bairro}))
        AND (${status}::text IS NULL OR status = ${status})
      ORDER BY scraped_at DESC NULLS LAST
      LIMIT 500
    `,
    sql<FonteStats[]>`
      SELECT fonte, COUNT(*)::int AS total, MAX(scraped_at) AS ultimo
      FROM empreendimentos_all
      GROUP BY fonte
      ORDER BY total DESC
    `,
  ])

  return Response.json({ items, stats })
}
