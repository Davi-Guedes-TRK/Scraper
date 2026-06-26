import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { withCache } from '@/lib/redis'

async function getMapaData() {
  const demanda = await sql`
    SELECT bairro, lat, lng, peso 
    FROM mapa_demanda 
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  `

  const ativos = await sql`
    SELECT codigo_imovel, bairro, lat, lng, tipo_imovel, preco 
    FROM mapa_ativos 
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  `

  // Para o pipefy, vamos pegar os cards que não estão 'Fechado' ou 'Não Captado'
  // e fazer um left join com mapa_demanda para herdar o lat/lng do bairro
  const pipe = await sql`
    SELECT 
      p.card_id, 
      p.bairro, 
      p.tipo_imovel, 
      p.valor_locacao_desejado, 
      p.fase_atual,
      d.lat,
      d.lng
    FROM pipefy_captacoes p
    LEFT JOIN mapa_demanda d ON UPPER(TRIM(p.bairro)) = d.bairro
    WHERE p.fase_atual NOT IN ('fechado', 'locado', 'nao_captado')
      AND d.lat IS NOT NULL
  `

  return { demanda, ativos, pipe }
}

export async function GET() {
  try {
    const data = await withCache('mapa-estrategico-v1', getMapaData, 3600) // cache de 1 hora
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error fetching mapa estrategico:', err)
    return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 })
  }
}
