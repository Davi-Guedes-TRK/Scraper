import { Metadata } from 'next'
import { MapaWrapper } from './mapa-wrapper'

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
        <MapaWrapper />
      </div>
    </div>
  )
}
