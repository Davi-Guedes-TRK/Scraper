import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { withCache } from '@/lib/redis'

async function getMapaData() {
  // Demanda em grão fino (1 linha = 1 atendimento em aberto) → permite filtrar e recalcular o heat no client.
  const atendimentos = await sql`
    SELECT codigo_atendimento, bairro, tipo_negocio, tipo_imovel, classe, tipo_utilizacao, preco_max, data_cadastro, lat, lng
    FROM mapa_atendimentos
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  `

  const ativos = await sql`
    SELECT codigo_imovel, bairro, lat, lng, tipo_imovel, preco, disponivel_venda, disponivel_locacao, endereco
    FROM mapa_ativos
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  `

  // Pipe = captação EM ANDAMENTO. Herda o centroide do bairro (mapa_demanda) e exclui
  // os terminais reais ('Não Captado' = perdido, 'Captado' = concluído). valor_estimado
  // é o campo preenchido (valor_locacao_desejado vem vazio no Pipefy).
  const pipe = await sql`
    SELECT p.card_id, p.bairro, p.tipo_imovel, p.valor_estimado, p.fase_atual, d.lat, d.lng,
           COALESCE(NULLIF(btrim(p.endereco_completo), ''), NULLIF(btrim(p.endereco_imovel), ''), p.endereco) AS endereco
    FROM pipefy_captacoes p
    LEFT JOIN mapa_demanda d ON UPPER(TRIM(p.bairro)) = d.bairro
    WHERE coalesce(p.fase_atual, '') NOT IN ('Não Captado', 'Captado')
      AND d.lat IS NOT NULL
  `

  return { atendimentos, ativos, pipe }
}

export async function GET() {
  try {
    // v2: shape novo (atendimentos em grão fino + flags nos ativos)
    const data = await withCache('mapa-estrategico-v5', 3600, getMapaData)
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error fetching mapa estrategico:', err)
    return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 })
  }
}
