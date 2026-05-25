import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { Topbar } from '@/components/topbar'
import { NewPropertiesProvider } from '@/components/new-properties-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <NewPropertiesProvider>
      <div className="flex min-h-screen page-bg">
        <Navbar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 h-screen">
          <Topbar email={user.email} />
          <main className="flex-1 overflow-auto min-h-0">{children}</main>
        </div>
      </div>
    </NewPropertiesProvider>
  )
}
