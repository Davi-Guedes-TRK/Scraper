'use client'

import dynamic from 'next/dynamic'

const MapaClient = dynamic(() => import('./mapa-estrategico-client'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-[calc(100vh-100px)] flex items-center justify-center bg-muted/20 animate-pulse">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p>Carregando mapa estratégico...</p>
      </div>
    </div>
  )
})

export function MapaWrapper() {
  return <MapaClient />
}
