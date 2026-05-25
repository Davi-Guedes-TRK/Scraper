import { createClient } from '@/lib/supabase/server'
import { FunilClient } from './funil-client'

export const dynamic = 'force-dynamic'

export default async function FunilPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipefy_captacoes')
    .select('card_id,titulo,fase_atual,bairro,tipo_imovel,criado_em,telefone_contato,outros_contatos,visita_agendada,visita_entrada,obs_visita,motivo_nao_captacao,valor_anuncio')
    .order('criado_em', { ascending: true })

  return <FunilClient data={data ?? []} />
}
