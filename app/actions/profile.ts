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

  // Try update first (works if row exists and RLS allows update)
  const { error: updateError, count } = await supabase
    .from('profiles')
    .update({ nome, tema, onboarding_completo: true })
    .eq('id', user.id)
    .select('id', { count: 'exact', head: true })

  if (!updateError && (count ?? 0) > 0) {
    // Update succeeded — row existed and was updated
    revalidatePath('/', 'layout')
    return { error: null }
  }

  // Row doesn't exist yet — try insert
  const { error: insertError } = await supabase
    .from('profiles')
    .insert({ id: user.id, nome, tema, onboarding_completo: true, papel: 'captador' })

  if (insertError) {
    // Last resort: try upsert
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, nome, tema, onboarding_completo: true })

    if (upsertError) {
      console.error('[saveProfile] all attempts failed:', { updateError, insertError, upsertError })
      return { error: 'Não foi possível salvar. Tente novamente.' }
    }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}
