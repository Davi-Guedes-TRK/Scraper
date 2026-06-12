'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import sql from '@/lib/db'

export async function saveProfile(
  _prev: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada.' }

  const nome = (formData.get('nome') as string | null)?.trim() || null
  const tema = (formData.get('tema') as string | null) ?? 'system'

  try {
    await sql`
      UPDATE profiles
      SET nome = ${nome},
          tema = ${tema},
          onboarding_completo = true
      WHERE id = ${user.id}
    `
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[saveProfile] SQL error:', msg)
    return { error: `Erro: ${msg}` }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}
