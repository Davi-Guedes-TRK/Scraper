'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

if (typeof window !== 'undefined') { (window as any).L = L; require('leaflet.heat') }

type Atend = { codigo_atendimento: string; bairro: string; tipo_negocio: string | null; tipo_imovel: string | null; classe: string | null; tipo_utilizacao: string | null; preco_max: number | string | null; lat: number; lng: number }
type Ativo = { codigo_imovel: string; bairro: string; lat: number; lng: number; tipo_imovel: string | null; preco: number | string | null; disponivel_venda: boolean | null; disponivel_locacao: boolean | null }
type Pipe = { card_id: number; bairro: string; tipo_imovel: string | null; valor_locacao_desejado: string | null; fase_atual: string | null; lat: number; lng: number }

function cssVar(n: string, f: string): string {
  if (typeof window === 'undefined') return f
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f
}
const classeDe = (t: string | null): string => {
  const s = (t || '').toUpperCase()
  if (/SALA|LOJA|COMERCIAL|GALP|PR[ÉE]DIO|ANDAR|LAJE|PONTO|ESCANINHO|POUSADA/.test(s)) return 'Comercial'
  if (/TERRENO|LOTE|CH[ÁA]CARA|CHACARA|FAZENDA|S[ÍI]TIO|[ÁA]REA/.test(s)) return 'Terreno/Rural'
  if (/APART|CASA|KIT|FLAT|COBERT|RESID|DUPLEX|SOBRADO|LOFT|VILA/.test(s)) return 'Residencial'
  return 'Outro'
}
const HEAT_GRADIENT: Record<number, string> = { 0.2: '#ddd6fe', 0.45: '#a78bfa', 0.7: '#f59e0b', 1.0: '#ef4444' }
const fmtBRL = (v: number | string | null) => (v ? 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—')
const titleCase = (s: string) => s.replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))
const toggle = (s: Set<string>, v: string) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n }

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points?.length) return
    // @ts-ignore leaflet.heat estende L em runtime
    const heat = L.heatLayer(points, { radius: 32, blur: 24, maxZoom: 14, minOpacity: 0.3, gradient: HEAT_GRADIENT }).addTo(map)
    return () => { map.removeLayer(heat) }
  }, [map, points])
  return null
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className="w-8 h-4 rounded-full relative flex-shrink-0 transition-colors duration-200" style={{ background: on ? 'var(--chart-1)' : 'var(--border)' }}>
      <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200" style={{ left: on ? '18px' : '2px' }} />
    </span>
  )
}
function Chip({ on, label, color, onClick }: { on: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition-all duration-150"
      style={{ border: '1px solid var(--border)', background: on ? 'color-mix(in srgb, var(--chart-1) 14%, transparent)' : 'transparent', color: on ? 'var(--foreground)' : 'var(--muted-foreground)', opacity: on ? 1 : 0.55 }}>
      {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}{label}
    </button>
  )
}
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p><div className="flex flex-wrap gap-1">{children}</div></div>
}
function Section({ title, color, on, onToggle, count, children }: { title: string; color: string; on: boolean; onToggle: () => void; count: number; children?: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: 'color-mix(in srgb, var(--muted) 50%, transparent)' }}>
        <button type="button" onClick={() => setOpen(o => !o)} className="text-[10px] w-3 cursor-pointer" style={{ color: 'var(--muted-foreground)' }}>{open ? '▾' : '▸'}</button>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="flex-1 text-[12px] font-medium text-foreground">{title}</span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{count.toLocaleString('pt-BR')}</span>
        <button type="button" onClick={onToggle} className="cursor-pointer" title="Ligar/desligar camada"><Switch on={on} /></button>
      </div>
      {open && on && children && <div className="px-2.5 py-2 flex flex-col gap-2.5">{children}</div>}
    </div>
  )
}

export default function MapaEstrategicoClient() {
  const [data, setData] = useState<{ atendimentos: Atend[]; ativos: Ativo[]; pipe: Pipe[] }>({ atendimentos: [], ativos: [], pipe: [] })
  const [loading, setLoading] = useState(true)
  const [cor, setCor] = useState({ ativo: '#7c3aed', pipe: '#f59e0b' })

  // camadas
  const [showHeat, setShowHeat] = useState(true)
  const [showAtivos, setShowAtivos] = useState(true)
  const [showPipe, setShowPipe] = useState(true)
  // filtros demanda
  const [selNeg, setSelNeg] = useState<Set<string>>(new Set())
  const [selClasseDem, setSelClasseDem] = useState<Set<string>>(new Set())
  const [selRegiao, setSelRegiao] = useState<Set<string>>(new Set())
  const [precoMin, setPrecoMin] = useState('')
  const [precoMax, setPrecoMax] = useState('')
  // filtros ativos
  const [ativoVenda, setAtivoVenda] = useState(true)
  const [ativoLoc, setAtivoLoc] = useState(true)
  const [selClasseAtivo, setSelClasseAtivo] = useState<Set<string>>(new Set())
  // filtros pipe
  const [selFase, setSelFase] = useState<Set<string>>(new Set())

  useEffect(() => { setCor({ ativo: cssVar('--chart-1', '#7c3aed'), pipe: '#f59e0b' }) }, [])
  useEffect(() => {
    fetch('/api/mapa').then(r => r.json()).then(res => {
      const d = { atendimentos: res.atendimentos ?? [], ativos: res.ativos ?? [], pipe: res.pipe ?? [] }
      setData(d)
      setSelNeg(new Set(uniq(d.atendimentos.map((a: Atend) => a.tipo_negocio).filter(Boolean) as string[])))
      setSelClasseDem(new Set(uniq(d.atendimentos.map((a: Atend) => a.classe).filter(Boolean) as string[])))
      setSelRegiao(new Set(uniq(d.atendimentos.map((a: Atend) => a.bairro).filter(Boolean) as string[])))
      setSelClasseAtivo(new Set(uniq(d.ativos.map((a: Ativo) => classeDe(a.tipo_imovel)))))
      setSelFase(new Set(uniq(d.pipe.map((p: Pipe) => p.fase_atual).filter(Boolean) as string[])))
      setLoading(false)
    }).catch(err => { console.error('Erro ao buscar dados do mapa', err); setLoading(false) })
  }, [])

  const negOpts = useMemo(() => uniq(data.atendimentos.map(a => a.tipo_negocio).filter(Boolean) as string[]).sort(), [data])
  const classeDemOpts = useMemo(() => uniq(data.atendimentos.map(a => a.classe).filter(Boolean) as string[]).sort(), [data])
  const regiaoOpts = useMemo(() => uniq(data.atendimentos.map(a => a.bairro).filter(Boolean) as string[]).sort(), [data])
  const classeAtivoOpts = useMemo(() => uniq(data.ativos.map(a => classeDe(a.tipo_imovel))).sort(), [data])
  const faseOpts = useMemo(() => uniq(data.pipe.map(p => p.fase_atual).filter(Boolean) as string[]).sort(), [data])

  const precoOk = (v: number | string | null) => {
    const mn = precoMin ? Number(precoMin) : null, mx = precoMax ? Number(precoMax) : null
    if (mn == null && mx == null) return true
    const n = v == null ? null : Number(v)
    if (n == null) return false
    if (mn != null && n < mn) return false
    if (mx != null && n > mx) return false
    return true
  }

  const atendF = useMemo(() => data.atendimentos.filter(a =>
    selNeg.has(a.tipo_negocio || '') && selClasseDem.has(a.classe || '') && selRegiao.has(a.bairro || '') && precoOk(a.preco_max),
  ), [data, selNeg, selClasseDem, selRegiao, precoMin, precoMax])
  const heatPoints = useMemo(() => atendF.map(a => [a.lat, a.lng, 1] as [number, number, number]), [atendF])

  const ativosF = useMemo(() => data.ativos.filter(a => {
    const v = !!a.disponivel_venda, l = !!a.disponivel_locacao
    const dispOk = (ativoVenda && v) || (ativoLoc && l) || (!v && !l && (ativoVenda || ativoLoc))
    return dispOk && selClasseAtivo.has(classeDe(a.tipo_imovel))
  }), [data, ativoVenda, ativoLoc, selClasseAtivo])

  const pipeF = useMemo(() => data.pipe.filter(p => selFase.has(p.fase_atual || '')), [data, selFase])

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
        .leaflet-tile-pane { filter: grayscale(1) contrast(1.04) brightness(1.02); }
        .leaflet-popup-content-wrapper { border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 8px 30px rgba(0,0,0,.12); }
        .leaflet-popup-tip { border: 1px solid var(--border); }
        .leaflet-control-zoom { border: 1px solid var(--border) !important; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
        .leaflet-control-zoom a { color: var(--foreground); background: var(--background); }
        .leaflet-control-attribution { background: color-mix(in srgb, var(--background) 80%, transparent) !important; color: var(--muted-foreground); }
      `}</style>

      {/* Painel de filtros */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 rounded-xl p-3 w-[256px] max-h-[calc(100vh-96px)] overflow-y-auto"
        style={{ background: 'color-mix(in srgb, var(--card) 94%, transparent)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
        <p className="eyebrow text-[9px] px-1" style={{ color: 'var(--muted-foreground)' }}>Camadas & filtros</p>

        {/* DEMANDA */}
        <Section title="Demanda" color="#ef4444" on={showHeat} onToggle={() => setShowHeat(v => !v)} count={atendF.length}>
          <FilterRow label="Tipo de negócio">
            {negOpts.map(o => <Chip key={o} label={titleCase(o)} on={selNeg.has(o)} onClick={() => setSelNeg(s => toggle(s, o))} />)}
          </FilterRow>
          <FilterRow label="Classe">
            {classeDemOpts.map(o => <Chip key={o} label={o} on={selClasseDem.has(o)} onClick={() => setSelClasseDem(s => toggle(s, o))} />)}
          </FilterRow>
          <FilterRow label="Faixa de preço (R$)">
            <input type="number" inputMode="numeric" placeholder="mín" value={precoMin} onChange={e => setPrecoMin(e.target.value)}
              className="w-[78px] h-7 px-2 text-[11px] rounded-md bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
            <input type="number" inputMode="numeric" placeholder="máx" value={precoMax} onChange={e => setPrecoMax(e.target.value)}
              className="w-[78px] h-7 px-2 text-[11px] rounded-md bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }} />
          </FilterRow>
          <FilterRow label="Região">
            {regiaoOpts.map(o => <Chip key={o} label={titleCase(o)} on={selRegiao.has(o)} onClick={() => setSelRegiao(s => toggle(s, o))} />)}
          </FilterRow>
        </Section>

        {/* ATIVOS */}
        <Section title="Imóveis ativos" color={cor.ativo} on={showAtivos} onToggle={() => setShowAtivos(v => !v)} count={ativosF.length}>
          <FilterRow label="Disponibilidade">
            <Chip label="Venda" on={ativoVenda} color="#2563eb" onClick={() => setAtivoVenda(v => !v)} />
            <Chip label="Locação" on={ativoLoc} color="#16a34a" onClick={() => setAtivoLoc(v => !v)} />
          </FilterRow>
          <FilterRow label="Classe">
            {classeAtivoOpts.map(o => <Chip key={o} label={o} on={selClasseAtivo.has(o)} onClick={() => setSelClasseAtivo(s => toggle(s, o))} />)}
          </FilterRow>
        </Section>

        {/* PIPE */}
        <Section title="Pipeline" color={cor.pipe} on={showPipe} onToggle={() => setShowPipe(v => !v)} count={pipeF.length}>
          <FilterRow label="Fase">
            {faseOpts.map(o => <Chip key={o} label={titleCase(o)} on={selFase.has(o)} onClick={() => setSelFase(s => toggle(s, o))} />)}
          </FilterRow>
        </Section>

        {showHeat && (
          <div className="px-1">
            <p className="text-[10px] mb-1" style={{ color: 'var(--muted-foreground)' }}>Intensidade da demanda</p>
            <div className="h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #ddd6fe, #a78bfa, #f59e0b, #ef4444)' }} />
            <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}><span>baixa</span><span>alta</span></div>
          </div>
        )}
      </div>

      <MapContainer center={center} zoom={12} className="w-full h-full z-0" style={{ width: '100%', height: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />

        {showHeat && <HeatmapLayer points={heatPoints} />}

        {showAtivos && ativosF.map(a => (
          <CircleMarker key={a.codigo_imovel} center={[a.lat, a.lng]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: cor.ativo, fillOpacity: 0.9 }}>
            <Popup>
              <div className="text-[12px] leading-relaxed">
                <span className="font-semibold" style={{ color: cor.ativo }}>● Ativo · {a.codigo_imovel}</span><br />
                <span className="text-muted-foreground">{a.bairro}</span><br />
                {a.tipo_imovel} · {[a.disponivel_venda ? 'venda' : null, a.disponivel_locacao ? 'locação' : null].filter(Boolean).join(' + ') || '—'}<br />
                <span className="font-semibold">{fmtBRL(a.preco)}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {showPipe && pipeF.map(p => (
          <CircleMarker key={`pipe-${p.card_id}`} center={[p.lat + (Math.random() - 0.5) * 0.004, p.lng + (Math.random() - 0.5) * 0.004]} radius={6} pathOptions={{ color: '#fff', weight: 1.5, fillColor: cor.pipe, fillOpacity: 0.9 }}>
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
