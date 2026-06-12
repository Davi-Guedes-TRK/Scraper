'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveProfile(
  _prev: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const nome = (formData.get('nome') as string | null)?.trim() || null
  const tema = (formData.get('tema') as string | null) ?? 'system'

  // upsert: creates the row if it doesn't exist, updates if it does
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, nome, tema, onboarding_completo: true })

  if (error) {
    console.error('[saveProfile] upsert failed:', error)
    return { error: 'Não foi possível salvar. Tente novamente.' }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}
