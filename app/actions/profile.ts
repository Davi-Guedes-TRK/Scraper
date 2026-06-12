'use server'

import { createClient } from '@/lib/supabase/server'

export async function saveProfile(
  _prev: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const nome = (formData.get('nome') as string | null)?.trim() || null
  const tema = (formData.get('tema') as string | null) ?? 'system'

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, nome, tema, onboarding_completo: true })

  if (error) return { error: 'Não foi possível salvar. Tente novamente.' }
  return { error: null }
}
