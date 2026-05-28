'use client'

import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { parsePreco, fmtBRL, parseLatLng } from '@/lib/formatters'
import { PortalBadge } from '@/components/portal-badge'

const BRASILIA_CENTER: [number, number] = [-15.7942, -47.8825]

type Coords = { lat: number; lng: number }

type Imovel = {
  link: string
  portal: string
  titulo?: string | null
  bairro?: string | null
  preco?: string | null
  endereco?: string | null
  maps_link?: string | null
  lat?: number | null
  lng?: number | null
  ativo?: boolean | null
  preco_reduzido?: boolean | null
}

type RouteItem = Imovel & { coords: Coords | null; distKm: number | null }

// ── Toast ──────────────────────────────────────────────────────────────────────
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const id = useRef(0)
  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const tid = ++id.current
    setToasts(ts => [...ts, { id: tid, msg, type }])
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== tid)), 3500)
  }, [])
  return { toasts, toast }
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[1200] pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white ${
          t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-zinc-700'
        }`}>{t.msg}</div>
      ))}
    </div>
  )
}

// ── Geo helpers ────────────────────────────────────────────────────────────────
function resolveCoords(item: Imovel): Coords | null {
  if (item.lat && item.lng) return { lat: item.lat, lng: item.lng }
  return parseLatLng(item.maps_link)
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function nearestNeighbor(origin: Coords, items: RouteItem[]): RouteItem[] {
  const withCoords = items.filter(i => i.coords)
  const noCoords = items.filter(i => !i.coords)
  const unvisited = [...withCoords]
  const route: RouteItem[] = []
  let current = origin

  while (unvisited.length > 0) {
    let nearestIdx = 0
    let nearestDist = haversine(current.lat, current.lng, unvisited[0].coords!.lat, unvisited[0].coords!.lng)
    for (let i = 1; i < unvisited.length; i++) {
      const d = haversine(current.lat, current.lng, unvisited[i].coords!.lat, unvisited[i].coords!.lng)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    }
    const next = unvisited.splice(nearestIdx, 1)[0]
    route.push({ ...next, distKm: nearestDist })
    current = next.coords!
  }
  return [...route, ...noCoords.map(i => ({ ...i, distKm: null }))]
}

function buildMapsUrl(origin: Coords | null, route: RouteItem[]): string | null {
  const stops = route.map(item => {
    if (item.coords) return `${item.coords.lat},${item.coords.lng}`
    if (item.endereco) return encodeURIComponent(item.endereco + ', Brasília, DF')
    return null
  }).filter((s): s is string => !!s)
  if (!stops.length) return null
  const from = origin ? `${origin.lat},${origin.lng}/` : ''
  return `https://www.google.com/maps/dir/${from}${stops.join('/')}`
}

function numberIcon(n: number, active: boolean): L.DivIcon {
  const bg = active ? '#0f766e' : '#0d9488'
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

// ── FitBounds ──────────────────────────────────────────────────────────────────
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) map.setView(points[0], 14)
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
  }, [points, map])
  return null
}

// ── MarkVisitedModal ───────────────────────────────────────────────────────────
function MarkVisitedModal({ item, onConfirm, onClose }: {
  item: RouteItem
  onConfirm: (item: RouteItem, endereco: string) => Promise<void>
  onClose: () => void
}) {
  const [endereco, setEndereco] = useState(item.endereco ?? '')
  const [saving, setSaving] = useState(false)

  const confirm = async () => {
    setSaving(true)
    await onConfirm(item, endereco)
    setSaving(false)
  }

  return (
    <div role="presentation" className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div role="presentation" className="bg-white border border-[#d0d7de] rounded-lg w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#d0d7de]">
          <h2 className="text-[#1f2328] font-semibold text-base">Marcar como visitado</h2>
          <p className="text-[#656d76] text-xs mt-0.5 truncate">{item.titulo}</p>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs text-[#656d76]">
            Confirme o <strong className="text-[#1f2328]">endereço completo</strong> descoberto na visita. Vai para o Relatório do Cartório.
          </p>
          <textarea value={endereco} onChange={e => setEndereco(e.target.value)} rows={3} autoFocus
            placeholder="Ex: SHIS QL 14 Conjunto 3 Casa 12, Lago Sul, Brasília-DF"
            className="w-full bg-[#f6f8fa] border border-[#d0d7de] text-[#1f2328] text-sm rounded-lg px-4 py-3 outline-none focus:border-trk-blue placeholder-[#656d76] transition-colors resize-none" />
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[#d0d7de]">
          <button onClick={onClose}
            className="flex-1 text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d0d7de] hover:border-[#8c959f] px-4 py-2.5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={confirm} disabled={saving || !endereco.trim()}
            className="flex-1 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
            {saving ? 'Salvando…' : 'Confirmar visita'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RouteItemCard ──────────────────────────────────────────────────────────────
function RouteItemCard({ item, index, active, onSelect, onMarkVisited }: {
  item: RouteItem
  index: number
  active: boolean
  onSelect: (link: string) => void
  onMarkVisited: (item: RouteItem) => void
}) {
  const preco = parsePreco(item.preco)
  const distLabel = item.distKm == null ? null
    : item.distKm < 1 ? `${Math.round(item.distKm * 1000)} m`
    : `${item.distKm.toFixed(1)} km`
  const mapsHref = item.maps_link
    ?? (item.coords ? `https://www.google.com/maps/search/${item.coords.lat},${item.coords.lng}`
      : item.endereco ? `https://www.google.com/maps/search/${encodeURIComponent(item.endereco + ', Brasília DF')}`
      : null)

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(item.link)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(item.link) }}
      className={`border rounded-lg p-3 flex items-start gap-3 cursor-pointer transition-colors ${
        active ? 'border-teal-400 bg-teal-50' : 'border-[#d0d7de] bg-white hover:border-[#8c959f]'
      }`}>
      <div className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${item.coords ? 'bg-teal-600' : 'bg-slate-300'}`}>
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#1f2328] text-sm font-medium leading-snug">{item.endereco || item.titulo || '—'}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.bairro && <span className="text-[#656d76] text-xs">{item.bairro}</span>}
          {preco > 0 && <span className="text-green-700 text-xs font-semibold">{fmtBRL(preco)}</span>}
          <PortalBadge portal={item.portal} />
          {item.preco_reduzido && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">↓ preço</span>
          )}
          {item.ativo === false && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">anúncio off</span>
          )}
        </div>
        {distLabel && <p className="text-teal-600 text-xs mt-1 font-medium">{distLabel} do ponto anterior</p>}
        {!item.coords && <p className="text-amber-500 text-xs mt-1">Sem coordenadas — não entra na rota</p>}
        <div className="flex gap-2 mt-2">
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="text-xs border border-[#d0d7de] hover:border-[#8c959f] text-[#656d76] px-2.5 py-1 rounded-lg transition-colors">
              Maps
            </a>
          )}
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="text-xs border border-trk-blue/30 hover:border-trk-blue text-trk-blue px-2.5 py-1 rounded-lg transition-colors">
              Anúncio
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onMarkVisited(item) }}
            className="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2.5 py-1 rounded-lg transition-colors font-medium ml-auto">
            Marcar visitado
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VisitasClient ──────────────────────────────────────────────────────────────
export function VisitasClient() {
  const { toasts, toast } = useToast()
  const [items, setItems] = useState<RouteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<Coords | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [marking, setMarking] = useState<RouteItem | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/visitas')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rows: Imovel[] = await res.json()
        setItems(rows.map(i => ({ ...i, coords: resolveCoords(i), distKm: null })))
      } catch (err) {
        toast(`Erro ao carregar: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const route = useMemo<RouteItem[]>(() => {
    if (location) return nearestNeighbor(location, items)
    return [...items.filter(i => i.coords), ...items.filter(i => !i.coords)]
  }, [location, items])

  const mapPoints = useMemo<[number, number][]>(() =>
    route.filter(i => i.coords).map(i => [i.coords!.lat, i.coords!.lng]),
    [route]
  )
  const withCoords = items.filter(i => i.coords).length

  const getLocation = () => {
    setLocLoading(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocLoading(false) },
      () => { setLocError('Não foi possível obter a localização.'); setLocLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const openAllMaps = () => {
    const url = buildMapsUrl(location, route)
    if (url) window.open(url, '_blank')
  }

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/visitas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? `HTTP ${res.status}`)
    }
  }

  const markVisited = async (item: RouteItem, endereco: string) => {
    try {
      await patch({
        link: item.link,
        portal: item.portal,
        visitado_em: new Date().toISOString(),
        endereco: endereco || item.endereco || null,
      })
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
      return
    }

    setItems(prev => prev.filter(i => i.link !== item.link))
    setMarking(null)
    toast('Visitado → enviado ao cartório', 'success')

    // geocodificação não-crítica: fire-and-forget
    if (endereco && endereco !== item.endereco) {
      fetch('/api/geocodificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endereco }),
      })
        .then(r => r.json())
        .then((geo: { lat?: number; lng?: number }) => {
          if (geo.lat && geo.lng) {
            patch({
              link: item.link,
              portal: item.portal,
              lat: geo.lat,
              lng: geo.lng,
              geocoded_em: new Date().toISOString(),
            }).catch(() => {})
          }
        })
        .catch(() => {})
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mapa */}
      <div className="flex-1 relative">
        <MapContainer center={BRASILIA_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <FitBounds points={location ? [[location.lat, location.lng], ...mapPoints] : mapPoints} />

          {location && (
            <CircleMarker center={[location.lat, location.lng]} radius={8}
              pathOptions={{ color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }} />
          )}

          {route.filter(i => i.coords).map((item, idx) => (
            <Marker
              key={`${item.portal}-${item.link}`}
              position={[item.coords!.lat, item.coords!.lng]}
              icon={numberIcon(idx + 1, selected === item.link)}
              eventHandlers={{ click: () => setSelected(item.link) }}
            />
          ))}
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <p className="text-[#656d76] text-sm">Carregando…</p>
          </div>
        )}
      </div>

      {/* Painel da rota */}
      <div className="w-[420px] flex-shrink-0 bg-[#f6f8fa] border-l border-[#d0d7de] flex flex-col">
        <div className="px-5 py-4 border-b border-[#d0d7de] bg-white">
          <h1 className="text-lg font-bold text-[#1f2328]">Visitas</h1>
          <p className="text-[#656d76] text-xs mt-0.5">
            {items.length} na fila · {withCoords} no mapa
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={getLocation} disabled={locLoading}
              className="flex-1 text-xs font-medium bg-primary hover:bg-primary-h disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
              {locLoading
                ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
              {location ? 'Atualizar local' : 'Minha localização'}
            </button>
            <button onClick={openAllMaps} disabled={!route.length}
              className="flex-1 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors">
              Abrir no Maps
            </button>
          </div>
          {locError && <p className="text-xs text-amber-600 mt-2">{locError}</p>}
          {!location && <p className="text-xs text-[#656d76] mt-2">Informe sua localização para otimizar a ordem das visitas.</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg animate-pulse bg-[#eaeef2]" />
            ))
          ) : route.length === 0 ? (
            <div className="text-center py-16 text-[#656d76]">
              <p className="font-medium text-[#1f2328]">Fila de visitas vazia</p>
              <p className="text-xs mt-1">Marque imóveis como "Visitar" na Triagem.</p>
            </div>
          ) : (
            route.map((item, idx) => (
              <RouteItemCard
                key={`${item.portal}-${item.link}`}
                item={item}
                index={idx + 1}
                active={selected === item.link}
                onSelect={setSelected}
                onMarkVisited={setMarking}
              />
            ))
          )}
        </div>
      </div>

      {marking && (
        <MarkVisitedModal item={marking} onConfirm={markVisited} onClose={() => setMarking(null)} />
      )}
      <ToastStack toasts={toasts} />
    </div>
  )
}
