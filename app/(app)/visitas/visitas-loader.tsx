'use client'

import dynamic from 'next/dynamic'

const VisitasClient = dynamic(() => import('./visitas-client').then(m => m.VisitasClient), {
  ssr: false,
  loading: () => (
    <div className="flex overflow-hidden h-full" style={{ minHeight: 0 }}>
      <div className="flex-1 animate-pulse" style={{ background: 'var(--muted)' }} />
      <div className="w-[420px] flex-shrink-0 flex flex-col p-3 gap-2" style={{ borderLeft: '1px solid var(--border)', background: 'var(--sidebar)' }}>
        <div className="h-6 w-24 rounded animate-pulse bg-muted mb-2" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg animate-pulse bg-muted border border-border" />
        ))}
      </div>
    </div>
  ),
})

export function VisitasLoader() {
  return <VisitasClient />
}
