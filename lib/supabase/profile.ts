'server-only'

import { createClient } from './server'

export type Papel = 'captador' | 'operador' | 'gestor' | 'admin'

export type Profile = {
  id: string
  nome: string | null
  papel: Papel
  onboarding_completo: boolean
  tema: 'light' | 'dark' | 'system' | null
}

export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, nome, papel, onboarding_completo, tema')
    .eq('id', userId)
    .single()

  // Fallback: se o profile ainda não existe, força onboarding (seguro — não pula)
  return data ?? {
    id: userId,
    nome: null,
    papel: 'captador' as Papel,
    onboarding_completo: false,
    tema: 'system',
  }
}

/** Retorna true se o papel pode ver a seção Sistema (scrapers, etc.) */
export function podeVerSistema(papel: Papel) {
  return papel === 'admin' || papel === 'gestor'
}

/** Retorna true se o papel pode executar ações destrutivas (descartar, submeter ônus) */
export function podeAcaoDestrutivaOuExterna(papel: Papel) {
  return papel === 'admin' || papel === 'operador' || papel === 'gestor'
}
