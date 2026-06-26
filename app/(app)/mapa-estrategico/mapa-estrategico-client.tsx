'use client'

import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Para o leaflet.heat achar o L
if (typeof window !== 'undefined') {
  ;(window as any).L = L
  require('leaflet.heat')
}

// Fix do ícone default no Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const IconAtivo = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})

const IconPipe = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})

// Tipos
type Demanda = { bairro: string, lat: number, lng: number, peso: number }
type Ativo = { codigo_imovel: string, bairro: string, lat: number, lng: number, tipo_imovel: string, preco: number }
type Pipe = { card_id: number, bairro: string, tipo_imovel: string, valor_locacao_desejado: string, fase_atual: string, lat: number, lng: number }

// Heatmap Component
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap()
  
  useEffect(() => {
    if (!points || points.length === 0) return
    // @ts-ignore
    const heat = L.heatLayer(points, { 
      radius: 35, 
      blur: 25, 
      maxZoom: 15, 
      max: 10,
      gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
    }).addTo(map)
    
    return () => {
      map.removeLayer(heat)
    }
  }, [map, points])

  return null
}

export default function MapaEstrategicoClient() {
  const [data, setData] = useState<{demanda: Demanda[], ativos: Ativo[], pipe: Pipe[]}>({demanda: [], ativos: [], pipe: []})
  const [loading, setLoading] = useState(true)
  const [showHeat, setShowHeat] = useState(true)
  const [showAtivos, setShowAtivos] = useState(true)
  const [showPipe, setShowPipe] = useState(true)

  useEffect(() => {
    fetch('/api/mapa')
      .then(res => res.json())
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(err => {
        console.error('Erro ao buscar dados do mapa', err)
        setLoading(false)
      })
  }, [])

  const heatPoints = useMemo(() => {
    return data.demanda.map(d => [d.lat, d.lng, d.peso] as [number, number, number])
  }, [data.demanda])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/10">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Centro de Brasília como fallback
  const center: [number, number] = [-15.7942, -47.8825]

  return (
    <div className="w-full h-full relative">
      {/* Controles do mapa */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2 bg-background/95 backdrop-blur shadow-md border rounded-md p-3 min-w-[200px]">
        <h3 className="font-semibold text-sm mb-1">Filtros</h3>
        
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
          <input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} className="rounded" />
          <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm" />
          Demanda (Heatmap)
          <span className="ml-auto text-xs text-muted-foreground">({data.demanda.reduce((acc, d) => acc + Number(d.peso), 0)})</span>
        </label>
        
        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
          <input type="checkbox" checked={showAtivos} onChange={e => setShowAtivos(e.target.checked)} className="rounded" />
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png" className="w-3 h-4" alt="Ativo" />
          Imóveis Ativos (TRK)
          <span className="ml-auto text-xs text-muted-foreground">({data.ativos.length})</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
          <input type="checkbox" checked={showPipe} onChange={e => setShowPipe(e.target.checked)} className="rounded" />
          <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png" className="w-3 h-4" alt="Pipefy" />
          Pipeline (Captação)
          <span className="ml-auto text-xs text-muted-foreground">({data.pipe.length})</span>
        </label>
      </div>

      <MapContainer 
        center={center} 
        zoom={12} 
        className="w-full h-full z-0"
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showHeat && <HeatmapLayer points={heatPoints} />}

        {showAtivos && data.ativos.map(ativo => (
          <Marker 
            key={ativo.codigo_imovel} 
            position={[ativo.lat, ativo.lng]} 
            icon={IconAtivo}
          >
            <Popup>
              <div className="text-sm">
                <strong>{ativo.codigo_imovel}</strong><br/>
                {ativo.bairro}<br/>
                {ativo.tipo_imovel}<br/>
                R$ {Number(ativo.preco).toLocaleString('pt-BR')}
              </div>
            </Popup>
          </Marker>
        ))}

        {showPipe && data.pipe.map(p => (
          <Marker 
            // Usamos math.random na chave só se precisar desambiguar coords iguais,
            // mas o ideal é adicionar um leve jitter se caírem no exato centroid do bairro
            key={`pipe-${p.card_id}`} 
            position={[
              p.lat + (Math.random() - 0.5) * 0.005, 
              p.lng + (Math.random() - 0.5) * 0.005
            ]} 
            icon={IconPipe}
          >
            <Popup>
              <div className="text-sm">
                <strong>Captação #{p.card_id}</strong><br/>
                Fase: {p.fase_atual}<br/>
                {p.bairro} - {p.tipo_imovel}<br/>
                {p.valor_locacao_desejado ? `Desejado: ${p.valor_locacao_desejado}` : 'Valor não informado'}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
