import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CartorioClient, type Processo } from './cartorio-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meu Cartório · Velvet' }

export default async function CartorioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // garante um profile na 1ª visita (não sobrescreve se já existe)
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? null, nome: user.email?.split('@')[0] ?? null },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  const [{ data: processos }, { data: profile }] = await Promise.all([
    supabase.from('cartorio_processos').select('*').order('updated_at', { ascending: false }),
    supabase.from('profiles').select('nome, cargo').eq('id', user.id).maybeSingle(),
  ])

  return <CartorioClient processos={(processos ?? []) as Processo[]} nome={profile?.nome ?? user.email ?? 'Você'} />
}
