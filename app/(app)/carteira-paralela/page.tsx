import sql from '@/lib/db'
import { CarteiraParalelaClient, type Match } from './carteira-paralela-client'

export const metadata = { title: 'Carteira Paralela · Velvet' }
export const dynamic = 'force-dynamic'

// Matching demanda×oferta materializado por scripts/sync_carteira_paralela.py.
async function getMatches(): Promise<Match[]> {
  try {
    return await sql<Match[]>`
      SELECT codigo_atendimento, inquilino, busca_tipo, busca_bairro, busca_preco_min, busca_preco_max,
             busca_area_min, busca_area_max, busca_dorm,
             codigo_imovel, tipo_imovel, bairro, endereco, area_util, qtd_dormitorios, preco_locacao,
             proprietario, telefone, lat, lng
      FROM carteira_paralela
      ORDER BY codigo_atendimento, preco_locacao
      LIMIT 3000
    `
  } catch (e) {
    console.error('[carteira-paralela] erro ao buscar matches:', e instanceof Error ? e.message : e)
    return []
  }
}

export default async function CarteiraParalelaPage() {
  return <CarteiraParalelaClient matches={await getMatches()} />
}
