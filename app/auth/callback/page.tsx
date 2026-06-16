'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Ponto de chegada de links do Supabase (convite, magic link).
// O token vem no hash fragment (#access_token=...&type=invite) — invisível ao servidor.
// O createBrowserClient detecta o hash e estabelece a sessão automaticamente.
// Para convites: redireciona para /reset-senha (usuário precisa definir senha).
// Para os demais: vai para / (roteamento normal cuida do onboarding).
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return
      const type = new URLSearchParams(window.location.hash.slice(1)).get('type')
      router.replace(type === 'invite' ? '/reset-senha' : '/')
    })
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
    </div>
  )
}
