'use client'

import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { parsePreco, fmtBRL, parseLatLng } from '@/lib/formatters'
import { PortalBadge } from '@/components/portal-badge'

const BRASILIA_CENTER: [number, number] = [-15.7942, -47.8825]
const QUEUE_KEY = 'visitas_queue'

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

type RouteItem = Imovel & { coords: Coords | null; distKm: number | null; pendente?: boolean }

type Resultado = 'captou' | 'recusou' | 'dono_ausente' | 'reagendar'

type QueueEntry = {
  id: string
  link: string
  portal: string
  resultado: Resultado
  nota: string
  endereco: string
  timestamp: string
  failed?: boolean
}

// ── Offline queue ──────────────────────────────────────────────────────────────
function readQueue(): QueueEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}
function writeQueue(q: QueueEntry[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}
function pushQueue(entry: Omit<QueueEntry, 'id' | 'timestamp'>) {
  const q = readQueue()
  q.push({ ...entry, id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString() })
  writeQueue(q)
}
function removeFromQueue(id: string) {
  writeQueue(readQueue().filter(e => e.id !== id))
}

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
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[1200] pointer-events-none">
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

function mapsHrefFor(item: Imovel): string | null {
  if (item.maps_link) return item.maps_link
  if (item.lat && item.lng) return `https://www.google.com/maps/search/${item.lat},${item.lng}`
  if (item.endereco) return `https://www.google.com/maps/search/${encodeURIComponent(item.endereco + ', Brasília DF')}`
  return null
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

// ── ResultSheet ────────────────────────────────────────────────────────────────
const RESULTADOS: { key: Resultado; label: string; desc: string; color: string; bg: string; icon: string }[] = [
  { key: 'captou',      label: 'Captou!',         desc: 'Dono aceitou — registrar captação',  color: '#16a34a', bg: '#dcfce7', icon: '✓' },
  { key: 'dono_ausente',label: 'Dono ausente',     desc: 'Não estava — tentar novamente',       color: '#d97706', bg: '#fef3c7', icon: '⊘' },
  { key: 'reagendar',   label: 'Reagendar',        desc: 'Prefere outro horário/dia',           color: '#7c3aed', bg: '#ede9fe', icon: '↺' },
  { key: 'recusou',     label: 'Recusou',          desc: 'Não tem interesse — descartar',       color: '#dc2626', bg: '#fee2e2', icon: '✕' },
]

function ResultSheet({ item, onClose, onSave }: {
  item: RouteItem
  onClose: () => void
  onSave: (resultado: Resultado, nota: string, endereco: string) => Promise<void>
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [nota, setNota] = useState('')
  const [endereco, setEndereco] = useState(item.endereco ?? '')
  const [saving, setSaving] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  const handleSave = async () => {
    if (!resultado) return
    setSaving(true)
    await onSave(resultado, nota, endereco)
    setSaving(false)
  }

  // Dismiss on backdrop click
  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onBackdrop}
    >
      <div
        ref={sheetRef}
        className="bg-white rounded-t-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.18)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Resultado da visita</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">{item.endereco || item.titulo || '—'}</p>
        </div>

        {/* Opções */}
        <div className="p-4 grid grid-cols-2 gap-2.5">
          {RESULTADOS.map(r => (
            <button
              key={r.key}
              onClick={() => setResultado(r.key)}
              className="flex flex-col items-start p-3.5 rounded-xl border-2 transition-all cursor-pointer text-left"
              style={{
                borderColor: resultado === r.key ? r.color : '#e5e7eb',
                background: resultado === r.key ? r.bg : 'white',
              }}
            >
              <span className="text-lg font-bold mb-1" style={{ color: r.color }}>{r.icon}</span>
              <span className="text-sm font-semibold text-gray-900">{r.label}</span>
              <span className="text-[11px] text-gray-500 mt-0.5 leading-snug">{r.desc}</span>
            </button>
          ))}
        </div>

        {/* Endereço (só quando captou) */}
        {resultado === 'captou' && (
          <div className="px-4 pb-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
              Endereço completo descoberto
            </label>
            <textarea
              value={endereco}
              onChange={e => setEndereco(e.target.value)}
              rows={2}
              placeholder="Ex: SHIS QL 14 Conjunto 3 Casa 12, Lago Sul"
              className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
            />
          </div>
        )}

        {/* Nota */}
        {resultado && resultado !== 'captou' && (
          <div className="px-4 pb-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
              Nota (opcional)
            </label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              placeholder="O que aconteceu?"
              className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 resize-none outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
            />
          </div>
        )}

        {/* CTA */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleSave}
            disabled={!resultado || saving}
            className="w-full h-12 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40 cursor-pointer"
            style={{ background: resultado ? (RESULTADOS.find(r => r.key === resultado)?.color ?? '#1f2937') : '#9ca3af' }}
          >
            {saving
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando…
                </span>
              : resultado ? `Salvar — ${RESULTADOS.find(r => r.key === resultado)?.label}` : 'Escolha um resultado'}
          </button>
          <button
            onClick={onClose}
            className="w-full mt-2 h-10 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RouteItemCard ──────────────────────────────────────────────────────────────
function RouteItemCard({ item, index, active, pendente, onSelect, onRegistrar }: {
  item: RouteItem
  index: number
  active: boolean
  pendente?: boolean
  onSelect: (link: string) => void
  onRegistrar: (item: RouteItem) => void
}) {
  const preco = parsePreco(item.preco)
  const distLabel = item.distKm == null ? null
    : item.distKm < 1 ? `${Math.round(item.distKm * 1000)} m`
    : `${item.distKm.toFixed(1)} km`
  const mapsHref = mapsHrefFor(item)

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        active ? 'border-teal-400' : 'border-[#d0d7de] hover:border-[#8c959f]'
      }`}
      style={{ background: active ? 'color-mix(in srgb, #14b8a6 6%, white)' : 'white' }}
    >
      {/* Card header — clicável p/ selecionar no mapa */}
      <div
        role="button" tabIndex={0}
        onClick={() => onSelect(item.link)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(item.link) }}
        className="flex items-start gap-3 p-3.5 cursor-pointer"
      >
        <div className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${item.coords ? 'bg-teal-600' : 'bg-slate-300'}`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#1f2328] text-sm font-semibold leading-snug">{item.endereco || item.titulo || '—'}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {item.bairro && <span className="text-[#656d76] text-xs">{item.bairro}</span>}
            {preco > 0 && <span className="text-green-700 text-xs font-semibold">{fmtBRL(preco)}</span>}
            <PortalBadge portal={item.portal} />
            {item.preco_reduzido && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">↓ preço</span>}
            {item.ativo === false && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">anúncio off</span>}
            {pendente && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">⟳ sincronizar</span>}
          </div>
          {distLabel && <p className="text-teal-600 text-xs mt-1 font-medium">{distLabel} do ponto anterior</p>}
          {!item.coords && <p className="text-amber-500 text-xs mt-1">Sem coordenadas — não entra na rota</p>}
        </div>
      </div>

      {/* Ações — touch targets ≥44px */}
      <div className="flex border-t border-[#d0d7de]">
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors"
            style={{ minHeight: 44 }}
            onClick={e => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Navegar
          </a>
        )}
        {item.link && (
          <a
            href={item.link}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center px-4 py-3 text-xs font-semibold text-[#656d76] hover:text-[#1f2328] border-l border-[#d0d7de] transition-colors"
            style={{ minHeight: 44 }}
            onClick={e => e.stopPropagation()}
          >
            Anúncio
          </a>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRegistrar(item) }}
          className="flex items-center justify-center px-4 py-3 text-xs font-bold text-[#1f2328] bg-gray-50 hover:bg-gray-100 border-l border-[#d0d7de] transition-colors cursor-pointer"
          style={{ minHeight: 44 }}
        >
          Registrar
        </button>
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
  const [registrando, setRegistrando] = useState<RouteItem | null>(null)
  const [mobileView, setMobileView] = useState<'mapa' | 'rota'>('mapa')
  const [pendentes, setPendentes] = useState<QueueEntry[]>([])

  // Carrega fila e tenta flush de pendentes
  useEffect(() => {
    const queue = readQueue()
    setPendentes(queue)

    // Tenta enviar itens pendentes
    for (const entry of queue) {
      if (entry.failed) continue
      flushEntry(entry).catch(() => {})
    }
  }, [])

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

  const patchVisita = async (body: Record<string, unknown>) => {
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

  const patchStatus = async (link: string, portal: string, status: string) => {
    const res = await fetch('/api/triagem', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link, portal, status }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }

  async function flushEntry(entry: QueueEntry) {
    try {
      if (entry.resultado === 'captou') {
        await patchVisita({ link: entry.link, portal: entry.portal, visitado_em: entry.timestamp, endereco: entry.endereco || null })
      } else if (entry.resultado === 'recusou') {
        await patchStatus(entry.link, entry.portal, 'descartado')
      }
      // dono_ausente / reagendar: apenas local por ora
      removeFromQueue(entry.id)
      setPendentes(q => q.filter(e => e.id !== entry.id))
    } catch {
      const q = readQueue().map(e => e.id === entry.id ? { ...e, failed: true } : e)
      writeQueue(q)
      setPendentes(q)
    }
  }

  const registrar = async (resultado: Resultado, nota: string, endereco: string) => {
    const item = registrando!
    const entry: Omit<QueueEntry, 'id' | 'timestamp'> = {
      link: item.link, portal: item.portal, resultado, nota, endereco,
    }

    if (resultado === 'captou' || resultado === 'recusou') {
      // Tenta direto; se falhar, vai pra fila
      try {
        if (resultado === 'captou') {
          await patchVisita({ link: item.link, portal: item.portal, visitado_em: new Date().toISOString(), endereco: endereco || item.endereco || null })
          setItems(prev => prev.filter(i => i.link !== item.link))
          toast('Captação registrada → enviado ao cartório', 'success')
        } else {
          await patchStatus(item.link, item.portal, 'descartado')
          setItems(prev => prev.filter(i => i.link !== item.link))
          toast('Imóvel descartado', 'info')
        }
        setRegistrando(null)
        return
      } catch {
        pushQueue(entry)
        setPendentes(readQueue())
        setItems(prev => prev.filter(i => i.link !== item.link))
        toast('Sem conexão — salvo localmente, enviará quando conectar', 'info')
        setRegistrando(null)
        return
      }
    }

    // dono_ausente / reagendar — salva localmente, mantém na lista com badge
    pushQueue(entry)
    setPendentes(readQueue())
    toast(resultado === 'dono_ausente' ? 'Anotado — imóvel permanece na fila' : 'Reagendado — anotado localmente', 'info')
    setRegistrando(null)
  }

  const tabBtn = (view: 'mapa' | 'rota', label: string) => (
    <button
      onClick={() => setMobileView(view)}
      className="flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
      style={{
        color: mobileView === view ? 'var(--chart-1)' : 'var(--muted-foreground)',
        borderBottom: mobileView === view ? '2px solid var(--chart-1)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  )

  // ─── Painel de rota ────────────────────────────────────────────────────────
  const routePanel = (
    <div className="flex-1 md:w-[420px] md:flex-shrink-0 bg-[#f6f8fa] border-l border-[#d0d7de] flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-[#d0d7de] bg-white">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-[#1f2328]">Visitas</h1>
          <p className="text-[#656d76] text-xs">{items.length} na fila · {withCoords} no mapa</p>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={getLocation} disabled={locLoading}
            className="flex-1 text-xs font-medium bg-primary hover:bg-primary-h disabled:opacity-50 text-white px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            style={{ minHeight: 44 }}>
            {locLoading
              ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
            {location ? 'Atualizar local' : 'Minha localização'}
          </button>
          <button onClick={openAllMaps} disabled={!route.length}
            className="flex-1 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-3 rounded-lg transition-colors cursor-pointer"
            style={{ minHeight: 44 }}>
            Abrir no Maps
          </button>
        </div>
        {locError && <p className="text-xs text-amber-600 mt-2">{locError}</p>}
        {!location && <p className="text-xs text-[#656d76] mt-2">Informe sua localização para otimizar a ordem.</p>}
        {pendentes.length > 0 && (
          <p className="text-xs text-orange-600 mt-2 font-medium">
            ⟳ {pendentes.length} resultado{pendentes.length > 1 ? 's' : ''} pendente{pendentes.length > 1 ? 's' : ''} de sincronização
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl animate-pulse bg-[#eaeef2]" />
          ))
        ) : route.length === 0 ? (
          <div className="text-center py-16 text-[#656d76]">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="font-semibold text-[#1f2328]">Fila de visitas vazia</p>
            <p className="text-xs mt-1">Marque imóveis como "Visitar" na Triagem.</p>
          </div>
        ) : (
          route.map((item, idx) => (
            <RouteItemCard
              key={`${item.portal}-${item.link}`}
              item={item}
              index={idx + 1}
              active={selected === item.link}
              pendente={pendentes.some(p => p.link === item.link)}
              onSelect={link => { setSelected(link); setMobileView('mapa') }}
              onRegistrar={setRegistrando}
            />
          ))
        )}
      </div>
    </div>
  )

  // ─── Mapa ──────────────────────────────────────────────────────────────────
  const mapPanel = (
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
  )

  return (
    <>
      {/* ── MOBILE ── */}
      <div className="flex flex-col h-full md:hidden">
        <div className="flex border-b border-[#d0d7de] bg-white flex-shrink-0">
          {tabBtn('mapa', 'Mapa')}
          {tabBtn('rota', `Rota${items.length > 0 ? ` (${items.length})` : ''}`)}
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileView === 'mapa' ? (
            <div className="h-full relative">
              {mapPanel}
              <button
                onClick={() => setMobileView('rota')}
                className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2 bg-white border border-[#d0d7de] shadow-lg px-4 py-2.5 rounded-full text-sm font-semibold text-[#1f2328] cursor-pointer"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Ver rota ({items.length})
              </button>
            </div>
          ) : (
            routePanel
          )}
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex h-screen overflow-hidden">
        {mapPanel}
        {routePanel}
      </div>

      {/* Bottom sheet de resultado */}
      {registrando && (
        <ResultSheet
          item={registrando}
          onClose={() => setRegistrando(null)}
          onSave={registrar}
        />
      )}

      <ToastStack toasts={toasts} />
    </>
  )
}
