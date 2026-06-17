'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'triagem_last_seen'
const PORTAL_TABLES = [
  'imoveis_olx', 'imoveis_dfimoveis', 'imoveis_vivareal', 'imoveis_zap',
] as const

export function useNewProperties() {
  const [count, setCount] = useState(0)
  const [latestTitle, setLatestTitle] = useState<string | null>(null)
  const supabase = createClient()
  const markedSeen = useRef(false)

  const markSeen = useCallback(() => {
    markedSeen.current = true
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setCount(0)
    setLatestTitle(null)
  }, [])

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY) ?? new Date(0).toISOString()

    // Contagem inicial: imóveis inseridos desde a última vez que o usuário abriu /triagem.
    // Ignora o resultado se markSeen() já foi chamado nesta sessão (ex: usuário já está na
    // página /triagem quando o app carrega — a query async chegaria depois e sobrescreveria 0).
    supabase
      .from('imoveis_todos')
      .select('*', { count: 'exact', head: true })
      .eq('status_triagem', 'pendente')
      .gt('coletado_em', lastSeen)
      .then(({ count: c }) => {
        if (!markedSeen.current && c && c > 0) setCount(c)
      })

    // Realtime: dispara só em INSERTs (imóveis genuinamente novos — upserts de links existentes geram UPDATE, não INSERT)
    const channels = PORTAL_TABLES.map(table =>
      supabase
        .channel(`notif-${table}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table },
          (payload) => {
            setCount(c => c + 1)
            setLatestTitle((payload.new as { titulo?: string }).titulo ?? 'Novo imóvel captado')
          }
        )
        .subscribe()
    )

    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [])

  return { count, latestTitle, markSeen }
}
