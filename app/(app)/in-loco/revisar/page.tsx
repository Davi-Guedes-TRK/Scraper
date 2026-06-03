import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RevisarClient } from './revisar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revisar capturas · Velvet' }

export default async function RevisarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <RevisarClient />
}
