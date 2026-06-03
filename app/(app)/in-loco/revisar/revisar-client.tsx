'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/page-header'
import { detectRegiao } from '@/lib/oficios'

const MatriculaMap = dynamic(() => import('../../triagem/matricula-map').then(m => m.MatriculaMap), {
  ssr: false, loading: () => <div className="rounded-lg bg-muted animate-pulse" style={{ height: 240 }} />,
})

type Cap = {
  id: number; lat: number | null; lng: number | null; endereco: string | null
  telefone: string | null; tipo_imovel: string | null; obs: string | null
  foto_url: string | null; status: string | null; criado_em: string | null
}
const TIPOS = ['Casa', 'Apartamento', 'Comercial', 'Terreno', 'Outro']
type Toast = { id: number; msg: string; type: 'ok' | 'err' }

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const la = a.lat * Math.PI / 180, lb = b.lat * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 ring-ring/30'
const inputStyle = { background: 'var(--secondary)', border: '1px solid var(--border)' }

export function RevisarClient() {
  const [supabase] = useState(() => createClient())
  const [caps, setCaps] = useState<Cap[]>([])
  const [filter, setFilter] = useState<'novo' | 'todas'>('novo')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const tid = useRef(0)
  const toast = useCallback((msg: string, type: Toast['type'] = 'ok') => {
    const id = ++tid.current; setToasts(t => [...t, { id, msg, type }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads_in_loco')
      .select('id,lat,lng,endereco,telefone,tipo_imovel,obs,foto_url,status,criado_em')
      .order('criado_em', { ascending: false }).limit(200)
    setCaps((data ?? []) as Cap[])
  }, [supabase])
  useEffect(() => { load() }, [load])

  const dupes = useMemo(() => {
    const s = new Set<number>()
    const pts = caps.filter(c => c.lat != null && c.lng != null)
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      if (distM({ lat: pts[i].lat!, lng: pts[i].lng! }, { lat: pts[j].lat!, lng: pts[j].lng! }) < 40) { s.add(pts[i].id); s.add(pts[j].id) }
    }
    return s
  }, [caps])

  const shown = caps.filter(c => filter === 'todas' ? true : (c.status ?? 'novo') === 'novo')
  const aRevisar = caps.filter(c => (c.status ?? 'novo') === 'novo').length

  const patch = useCallback(async (id: number, p: Partial<Cap>) => {
    await supabase.from('leads_in_loco').update(p).eq('id', id); await load()
  }, [supabase, load])

  const pedirMatricula = useCallback(async (endereco: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('cartorio_processos').insert({
      responsavel: user.id, regiao: detectRegiao(endereco), status: 'pendente',
      observacao: `In Loco — ${endereco ?? 'sem endereço'}`,
    })
    if (error) toast('Erro ao criar processo', 'err'); else toast('Enviado pro Meu Cartório ✓')
    await load()
  }, [supabase, toast, load])

  const tabCls = (on: boolean) => `px-3 h-8 rounded-lg text-[12px] font-medium transition-colors ${on ? 'text-foreground' : 'text-muted-foreground'}`
  const tabStyle = (on: boolean) => on ? { background: 'var(--accent)' } : { border: '1px solid var(--border)' }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-3">
      <PageHeader eyebrow="In Loco · revisão" title="Revisar capturas" subtitle="Confirme o endereço (arraste o pino), complete o que faltar e dê o destino. As cruas vêm primeiro." />

      <div className="flex items-center gap-2">
        <button onClick={() => setFilter('novo')} className={tabCls(filter === 'novo')} style={tabStyle(filter === 'novo')}>A revisar ({aRevisar})</button>
        <button onClick={() => setFilter('todas')} className={tabCls(filter === 'todas')} style={tabStyle(filter === 'todas')}>Todas ({caps.length})</button>
        <a href="/in-loco" className="ml-auto text-[12px] text-primary hover:underline">← capturar</a>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">{filter === 'novo' ? 'Tudo revisado ✓' : 'Nenhuma captura ainda.'}</p>
      ) : (
        shown.map(c => (
          <CardRevisao
            key={c.id} c={c} dup={dupes.has(c.id)} expanded={expandedId === c.id}
            onToggle={() => setExpandedId(id => (id === c.id ? null : c.id))}
            onPatch={patch} onPedir={pedirMatricula} onDone={() => setExpandedId(null)}
          />
        ))
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white ${t.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>{t.msg}</div>)}
        </div>
      )}
    </div>
  )
}

const STATUS_BADGE: Record<string, { label: string; bg: string }> = {
  novo: { label: 'cru', bg: '#c08a3e' },
  revisado: { label: 'revisado', bg: '#5d7a43' },
  descartado: { label: 'descartado', bg: '#8a8a8a' },
}

function CardRevisao({ c, dup, expanded, onToggle, onPatch, onPedir, onDone }: {
  c: Cap; dup: boolean; expanded: boolean; onToggle: () => void
  onPatch: (id: number, p: Partial<Cap>) => Promise<void>
  onPedir: (endereco: string | null) => Promise<void>
  onDone: () => void
}) {
  const [end, setEnd] = useState(c.endereco ?? '')
  const [tel, setTel] = useState(c.telefone ?? '')
  const [tipo, setTipo] = useState(c.tipo_imovel ?? '')
  const [obs, setObs] = useState(c.obs ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null)
  const [busy, setBusy] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const st = STATUS_BADGE[c.status ?? 'novo'] ?? STATUS_BADGE.novo

  const onPin = async (lat: number, lng: number) => {
    setCoords({ lat, lng }); setGeocoding(true)
    try {
      const res = await fetch('/api/in-loco/geo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lng }) })
      const g = await res.json().catch(() => ({}))
      if (res.ok && g.endereco) setEnd(g.endereco)
    } catch { /* mantém o que está */ } finally { setGeocoding(false) }
  }

  const usarLoc = () => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(p => onPin(p.coords.latitude, p.coords.longitude), () => {}, { enableHighAccuracy: true, timeout: 15000 })
  }

  const campos = (): Partial<Cap> => ({ endereco: end.trim() || null, telefone: tel.trim() || null, tipo_imovel: tipo || null, obs: obs.trim() || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null })
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const salvar = () => run(async () => { await onPatch(c.id, campos()) })
  const concluir = () => run(async () => { await onPatch(c.id, { ...campos(), status: 'revisado' }); onDone() })
  const descartar = () => run(async () => { await onPatch(c.id, { status: 'descartado' }); onDone() })
  const pedir = () => run(async () => { await onPatch(c.id, { ...campos(), status: 'revisado' }); await onPedir(end.trim() || null); onDone() })

  return (
    <div className="card rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left hover:bg-accent/20 transition-colors">
        {c.foto_url ? <img src={c.foto_url} alt="" className="w-16 h-16 object-cover flex-shrink-0" /> : <div className="w-16 h-16 flex-shrink-0" style={{ background: 'var(--muted)' }} />}
        <div className="min-w-0 flex-1 py-2">
          <p className="text-sm text-foreground font-medium leading-snug truncate">{c.endereco || (c.lat ? 'Sem endereço — abra pra resolver' : 'Sem GPS — abra pra ajustar')}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span>{c.tipo_imovel || 'sem tipo'}</span>
            {dup && <span className="px-1.5 py-0.5 rounded-full text-white" style={{ background: '#b4543a', fontSize: 9 }}>possível duplicata</span>}
          </p>
        </div>
        <span className="text-[9px] px-2 py-1 rounded-full mr-2 flex-shrink-0 text-white" style={{ background: st.bg }}>{st.label}</span>
      </button>

      {expanded && (
        <div className="p-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          {coords ? (
            <>
              <MatriculaMap lat={coords.lat} lng={coords.lng} onDragEnd={onPin} />
              <p className="text-[11px] text-muted-foreground -mt-1 text-center">Arraste o pino pro imóvel certo. {geocoding ? 'buscando endereço…' : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}</p>
            </>
          ) : (
            <button onClick={usarLoc} className="h-10 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Usar minha localização atual</button>
          )}

          <input value={end} onChange={e => setEnd(e.target.value)} placeholder="Endereço" className={inputCls} style={inputStyle} />
          <div className="grid grid-cols-2 gap-3">
            <input value={tel} onChange={e => setTel(e.target.value)} type="tel" placeholder="Telefone (da placa)" className={inputCls} style={inputStyle} />
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">tipo —</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observações (placa Imobiliária X, prédio antigo…)" className={`${inputCls} resize-none`} style={inputStyle} />

          <div className="grid grid-cols-2 gap-2">
            <button onClick={salvar} disabled={busy} className="h-10 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40" style={{ border: '1px solid var(--border)' }}>Salvar</button>
            <button onClick={concluir} disabled={busy} className="h-10 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: '#5d7a43' }}>Concluir ✓</button>
            <button onClick={pedir} disabled={busy} className="h-10 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: '#6e4d34' }}>Pedir matrícula</button>
            <button onClick={descartar} disabled={busy} className="h-10 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-40" style={{ border: '1px solid var(--border)' }}>Descartar</button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 text-center -mt-1">"Pedir matrícula" cria um processo no seu Meu Cartório já agrupado pelo ofício da região.</p>
        </div>
      )}
    </div>
  )
}
