import sql from '@/lib/db'
import { ProprietariosClient, type Proprietario } from './proprietarios-client'

export const metadata = { title: 'Proprietários · Velvet' }
export const dynamic = 'force-dynamic'

// Lê o espelho do dw_trk no Supabase (dw_pessoas/dw_imoveis, via scripts/dw_sync.mjs).
// Só proprietários COM imóvel — que é quem interessa pra rodada de escuta.
async function getProprietarios(): Promise<Proprietario[]> {
  try {
    return await sql<Proprietario[]>`
      SELECT p.codigo_pessoa, p.nome, p.telefones, p.emails, p.cidade, p.uf,
             count(i.codigo_imovel)::int AS n_imoveis,
             (array_agg(DISTINCT i.tipo_imovel) FILTER (WHERE i.tipo_imovel IS NOT NULL)) AS tipos
      FROM dw_pessoas p
      JOIN dw_imoveis i ON i.codigo_proprietario = p.codigo_pessoa
      WHERE p.e_proprietario IS TRUE
      GROUP BY p.codigo_pessoa, p.nome, p.telefones, p.emails, p.cidade, p.uf
      ORDER BY count(i.codigo_imovel) DESC, p.nome
      LIMIT 3000
    `
  } catch (e) {
    console.error('[proprietarios] erro ao buscar:', e instanceof Error ? e.message : e)
    return []
  }
}

export default async function ProprietariosPage() {
  return <ProprietariosClient proprietarios={await getProprietarios()} />
}
