import { createClient } from '@/lib/supabase/server'
import { CaptacaoClient, type Target } from './captacao-client'

export const metadata = { title: 'Captação · Velvet' }

// Lê do Supabase (tabela materializada do dw_trk pelo scripts/sync_captacao.py).
// RLS: a policy "captacao_targets_read_authenticated" libera o role authenticated,
// e o (app)/layout já redireciona quem não está logado.
async function getTargets(): Promise<Target[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('captacao_targets')
    .select('*')
    .order('score', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[captacao] erro ao buscar alvos:', error.message)
    return []
  }
  return (data ?? []) as Target[]
}

export default async function CaptacaoPage() {
  const targets = await getTargets()
  return <CaptacaoClient targets={targets} />
}
