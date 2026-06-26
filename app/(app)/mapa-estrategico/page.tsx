import { Metadata } from 'next'
import dynamic from 'next/dynamic'

// Leaflet precisa do window, então desabilitamos o SSR para o mapa
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

export const metadata: Metadata = {
  title: 'Mapa Estratégico',
  description: 'Mapa de Calor de Demandas vs Oferta',
}

export default function MapaEstrategicoPage() {
  return (
    <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-hidden">
      <div className="p-4 border-b bg-background z-10 shadow-sm shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Mapa Estratégico</h1>
        <p className="text-muted-foreground text-sm">
          Visão de demandas abertas cruzadas com a oferta de imóveis ativos e captações do Pipefy.
        </p>
      </div>
      <div className="flex-1 relative">
        <MapaClient />
      </div>
    </div>
  )
}
