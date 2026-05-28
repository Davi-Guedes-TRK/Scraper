'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signIn(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) return { error: 'Email ou senha incorretos.' }
  redirect('/')
}

export async function resetPassword(_prev: { error: string | null; sent: boolean }, formData: FormData): Promise<{ error: string | null; sent: boolean }> {
  const email = formData.get('email') as string
  if (!email.trim()) return { error: 'Informe o email.', sent: false }

  // NEXT_PUBLIC_SITE_URL deve ser definida no Vercel como https://erp-trk.vercel.app
  // Fallback para inferir pelo header (útil em dev local)
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    const headersList = await headers()
    const host = headersList.get('host') ?? 'localhost:3000'
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    siteUrl = `${proto}://${host}`
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/reset-senha`,
  })
  if (error) return { error: 'Não foi possível enviar o email. Verifique o endereço.', sent: false }
  return { error: null, sent: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
