export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/profile'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Topbar } from '@/components/topbar'
import { DataSourceBar } from '@/components/data-source-bar'
import { NewPropertiesProvider } from '@/components/new-properties-provider'
import { WelcomeOverlay } from '@/components/welcome-overlay'
import { BottomNav } from '@/components/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getProfile(user.id)

  if (!profile.onboarding_completo) redirect('/onboarding')

  return (
    <NewPropertiesProvider>
      <WelcomeOverlay />
      <div className="flex min-h-screen page-bg">
        <Navbar papel={profile.papel} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 h-screen">
          <Topbar email={user.email} nome={profile.nome} />
          <DataSourceBar />
          <main className="flex-1 overflow-auto min-h-0 pb-14 md:pb-0">{children}</main>
        </div>
      </div>
      <BottomNav papel={profile.papel} />
    </NewPropertiesProvider>
  )
}
