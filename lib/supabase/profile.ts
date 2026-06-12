'server-only'

import sql from '@/lib/db'

export type Papel = 'captador' | 'operador' | 'gestor' | 'admin'

export type Profile = {
  id: string
  nome: string | null
  papel: Papel
  onboarding_completo: boolean
  tema: 'light' | 'dark' | 'system' | null
}

export async function getProfile(userId: string): Promise<Profile> {
  const rows = await sql`
    SELECT id, nome, papel, onboarding_completo, tema
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `

  if (rows.length > 0) {
    const r = rows[0]
    return {
      id: r.id,
      nome: r.nome,
      papel: r.papel as Papel,
      onboarding_completo: r.onboarding_completo,
      tema: r.tema,
    }
  }

  // Fallback: se o profile ainda não existe, força onboarding (seguro — não pula)
  return {
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
