'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// leaflet.heat precisa do L global
if (typeof window !== 'undefined') {
  ;(window as any).L = L
  require('leaflet.heat')
}

type Demanda = { bairro: string; lat: number; lng: number; peso: number }
type Ativo = { codigo_imovel: string; bairro: string; lat: number; lng: number; tipo_imovel: string; preco: number }
type Pipe = { card_id: number; bairro: string; tipo_imovel: string; valor_locacao_desejado: string; fase_atual: string; lat: number; lng: number }

// Lê uma cor do tema (CSS var resolvida) — leaflet (SVG) não entende var() direto.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const HEAT_GRADIENT: Record<number, string> = { 0.2: '#ddd6fe', 0.45: '#a78bfa', 0.7: '#f59e0b', 1.0: '#ef4444' }
const fmtBRL = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points?.length) return
    const max = Math.max(...points.map(p => p[2]), 1)
    // @ts-ignore — leaflet.heat estende L em runtime
    const heat = L.heatLayer(points, { radius: 40, blur: 30, maxZoom: 14, max, minOpacity: 0.3, gradient: HEAT_GRADIENT }).addTo(map)
    return () => { map.removeLayer(heat) }
  }, [map, points])
  return null
}

function Toggle({ on, onChange, color, label, count }: { on: boolean; onChange: (v: boolean) => void; color: string; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-all duration-200"
      style={{ background: on ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'transparent', opacity: on ? 1 : 0.5 }}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : 'none' }} />
      <span className="flex-1 text-left text-foreground">{label}</span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{count.toLocaleString('pt-BR')}</span>
      <span className="w-8 h-4 rounded-full relative transition-colors duration-200 flex-shrink-0" style={{ background: on ? 'var(--chart-1)' : 'var(--border)' }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200" style={{ left: on ? '18px' : '2px' }} />
      </span>
    </button>
  )
}

export default function MapaEstrategicoClient() {
  const [data, setData] = useState<{ demanda: Demanda[]; ativos: Ativo[]; pipe: Pipe[] }>({ demanda: [], ativos: [], pipe: [] })
  const [loading, setLoading] = useState(true)
  const [showHeat, setShowHeat] = useState(true)
  const [showAtivos, setShowAtivos] = useState(true)
  const [showPipe, setShowPipe] = useState(true)
  const [cor, setCor] = useState({ ativo: '#7c3aed', pipe: '#f59e0b' })

  useEffect(() => { setCor({ ativo: cssVar('--chart-1', '#7c3aed'), pipe: '#f59e0b' }) }, [])

  useEffect(() => {
    fetch('/api/mapa')
      .then(res => res.json())
      .then(res => { setData(res); setLoading(false) })
      .catch(err => { console.error('Erro ao buscar dados do mapa', err); setLoading(false) })
  }, [])

  // sqrt comprime a escala (Lago Sul tem peso ~225 vs ~19 dos outros — senão satura tudo)
  const heatPoints = useMemo(
    () => data.demanda.map(d => [d.lat, d.lng, Math.sqrt(Number(d.peso) || 0)] as [number, number, number]),
    [data.demanda],
  )
  const totalDemanda = useMemo(() => data.demanda.reduce((a, d) => a + Number(d.peso), 0), [data.demanda])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--muted)' }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid var(--border)', borderTopColor: 'var(--chart-1)' }} />
      </div>
    )
  }

  const center: [number, number] = [-15.7942, -47.8825]

  return (
    <div className="w-full h-full relative">
      <style>{`
        .leaflet-container { background: var(--muted); font-family: inherit; }
        .leaflet-popup-content-wrapper { border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 8px 30px rgba(0,0,0,.12); padding: 2px; }
        .leaflet-popup-tip { border: 1px solid var(--border); }
        .leaflet-bar a { border-radius: 8px !important; color: var(--foreground); }
        .leaflet-control-attribution { background: color-mix(in srgb, var(--background) 80%, transparent) !important; color: var(--muted-foreground); border-radius: 6px 0 0 0; }
        .leaflet-control-zoom { border: 1px solid var(--border) !important; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
      `}</style>

      {/* Painel de camadas */}
      <div
        className="absolute top-4 right-4 z-[1000] flex flex-col gap-1 rounded-xl p-3 w-[224px]"
        style={{ background: 'color-mix(in srgb, var(--card) 92%, transparent)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,.10)' }}
      >
        <p className="eyebrow text-[9px] px-1 pb-1" style={{ color: 'var(--muted-foreground)' }}>Camadas</p>
        <Toggle on={showHeat} onChange={setShowHeat} color="#ef4444" label="Demanda" count={totalDemanda} />
        <Toggle on={showAtivos} onChange={setShowAtivos} color={cor.ativo} label="Imóveis ativos" count={data.ativos.length} />
        <Toggle on={showPipe} onChange={setShowPipe} color={cor.pipe} label="Pipeline" count={data.pipe.length} />

        {showHeat && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>Intensidade da demanda</p>
            <div className="h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #ddd6fe, #a78bfa, #f59e0b, #ef4444)' }} />
            <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              <span>baixa</span><span>alta</span>
            </div>
          </div>
        )}
      </div>

      <MapContainer center={center} zoom={12} className="w-full h-full z-0" style={{ width: '100%', height: '100%' }} zoomControl={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url="https://{s}.basemap.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        {showHeat && <HeatmapLayer points={heatPoints} />}

        {showAtivos && data.ativos.map(a => (
          <CircleMarker
            key={a.codigo_imovel}
            center={[a.lat, a.lng]}
            radius={5}
            pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: cor.ativo, fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-[12px] leading-relaxed">
                <span className="font-semibold" style={{ color: cor.ativo }}>● Ativo · {a.codigo_imovel}</span><br />
                <span className="text-muted-foreground">{a.bairro}</span><br />
                {a.tipo_imovel}<br />
                <span className="font-semibold">{fmtBRL(a.preco)}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {showPipe && data.pipe.map(p => (
          <CircleMarker
            key={`pipe-${p.card_id}`}
            center={[p.lat + (Math.random() - 0.5) * 0.004, p.lng + (Math.random() - 0.5) * 0.004]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: cor.pipe, fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-[12px] leading-relaxed">
                <span className="font-semibold" style={{ color: cor.pipe }}>◆ Pipeline · #{p.card_id}</span><br />
                <span className="text-muted-foreground">{p.fase_atual}</span><br />
                {p.bairro} · {p.tipo_imovel}<br />
                {p.valor_locacao_desejado ? <span className="font-semibold">{p.valor_locacao_desejado}</span> : <span className="text-muted-foreground">valor não informado</span>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
