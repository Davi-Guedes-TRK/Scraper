import sql from '@/lib/db'
import { CaptacaoClient, type Lead } from './captacao-client'

export const metadata = { title: 'Alugamos, não Administramos · Velvet' }
export const dynamic = 'force-dynamic'

// Lê do Supabase (tabela materializada do Nido/dw_trk por scripts/sync_nao_adm.py).
// Via `sql` (postgres direto, server-side) — não depende de policy RLS.
async function getLeads(): Promise<Lead[]> {
  try {
    return await sql<Lead[]>`
      SELECT codigo_imovel, proprietario, telefone, tipo_imovel, bairro, cidade,
             endereco, area_util, valor_locacao, dias_inativo, desde, lat, lng
      FROM leads_nao_adm
      ORDER BY valor_locacao DESC NULLS LAST
      LIMIT 2000
    `
  } catch (e) {
    console.error('[nao-adm] erro ao buscar leads:', e instanceof Error ? e.message : e)
    return []
  }
}

export default async function CaptacaoPage() {
  const leads = await getLeads()
  return <CaptacaoClient leads={leads} />
}
