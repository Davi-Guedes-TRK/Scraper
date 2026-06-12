import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { OnboardingClient } from './onboarding-client'

export const metadata = { title: 'Bem-vindo · Velvet' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (profile.onboarding_completo) redirect('/dashboard')

  return <OnboardingClient papel={profile.papel} nomeInicial={profile.nome} />
}
