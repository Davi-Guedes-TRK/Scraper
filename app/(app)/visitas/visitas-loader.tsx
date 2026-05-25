'use client'

import dynamic from 'next/dynamic'

const VisitasClient = dynamic(() => import('./visitas-client').then(m => m.VisitasClient), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-[#656d76] text-sm">
      Carregando mapa…
    </div>
  ),
})

export function VisitasLoader() {
  return <VisitasClient />
}
