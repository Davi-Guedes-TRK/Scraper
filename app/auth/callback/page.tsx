'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // Detecta erro no hash (ex: link expirado enviado pelo Supabase)
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.get('error')) {
      setExpired(true)
      return
    }

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return
      const type = params.get('type') || new URLSearchParams(window.location.hash.slice(1)).get('type')
      router.replace(type === 'invite' ? '/reset-senha' : '/')
    })

    // Fallback: se em 5s não houve sessão, link provavelmente expirou
    const t = setTimeout(() => setExpired(true), 5000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [router])

  if (expired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-slate-600 text-sm text-center">Link expirado ou inválido.</p>
        <button
          onClick={() => router.replace('/login')}
          className="text-sm font-semibold underline text-slate-700"
        >
          Voltar para o login
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
    </div>
  )
}
