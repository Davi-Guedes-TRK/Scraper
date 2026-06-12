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

  const { error } = await supabase
    .from('profiles')
    .update({ nome, tema, onboarding_completo: true })
    .eq('id', user.id)

  if (error) {
    console.error('[saveProfile] update failed:', JSON.stringify(error))
    return { error: `Erro: ${error.message} (code: ${error.code})` }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}
