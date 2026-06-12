'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Lote = { lote: string | null; conjunto: string | null; area_proj: number | null; end_cart: string | null }
type Candidato = {
  endereco: string | null
  score: number
  addrScore: number
  areaScore: number | null
  loteMatch: boolean
  distancia_m: number | null
  lote: Lote
}
type Resultado = {
  candidatos: Candidato[]
  melhor: Candidato | null
  confianca: 'alta' | 'media' | 'baixa' | 'nenhuma'
}

const CONF = {
  alta:    { label: 'Confiança alta',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  media:   { label: 'Confiança média',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  baixa:   { label: 'Confiança baixa',  cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  nenhuma: { label: 'Sem candidato',    cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
} as const

const FIELDS = [
  { key: 'endereco',  label: 'Endereço (livre)', ph: 'ex.: QNN 24 Conjunto H Lote 20', wide: true },
  { key: 'quadra',    label: 'Quadra',           ph: 'QNN 24' },
  { key: 'conjunto',  label: 'Conjunto',         ph: 'CJ H' },
  { key: 'casa_lote', label: 'Lote',             ph: '20' },
  { key: 'area_m2',   label: 'Área (m²)',        ph: '144' },
] as const

export function GeoportalClient() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [form, setForm] = useState<Record<string, string>>({
    endereco:  searchParams.get('endereco')  ?? '',
    quadra:    searchParams.get('quadra')    ?? '',
    conjunto:  searchParams.get('conjunto')  ?? '',
    casa_lote: searchParams.get('casa_lote') ?? '',
    area_m2:   searchParams.get('area_m2')   ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const syncUrl = useCallback((f: Record<string, string>) => {
    const params = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v.trim()) params.set(k, v) })
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router])

  const buscar = async (f = form) => {
    syncUrl(f)
    setLoading(true); setErro(null); setRes(null)
    const body: Record<string, unknown> = {}
    if (f.endereco)  body.endereco  = f.endereco
    if (f.quadra)    body.quadra    = f.quadra
    if (f.conjunto)  body.conjunto  = f.conjunto
    if (f.casa_lote) body.casa_lote = f.casa_lote
    if (f.area_m2)   body.area_m2   = parseFloat(f.area_m2.replace(',', '.'))
    try {
      const r = await fetch('/api/geoportal/candidatos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Erro na busca')
      setRes(j as Resultado)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight mb-1">Geoportal — Candidatos de Lote</h1>
        <p className="text-sm text-muted-foreground">
          Busca os lotes prováveis no cadastro oficial do DF (IDE-DF) e ranqueia por endereço + área.
          Confiança <span className="text-emerald-400">alta</span> alimenta o auto-envio ao cartório.
        </p>
      </div>

      {/* Formulário */}
      <div className="rounded-xl border border-white/8 bg-card p-4 mb-6">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={'wide' in f && f.wide ? 'col-span-2' : ''}>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 font-mono">{f.label}</label>
              <input
                value={form[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder={f.ph}
                className="w-full h-9 px-3 rounded-lg border border-white/10 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--chart-1)]"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => buscar()}
          disabled={loading}
          className="mt-4 h-9 px-5 rounded-lg text-sm font-semibold bg-[var(--chart-1)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
        >
          {loading
            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Buscando…</>
            : 'Buscar candidatos'}
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <span>{erro}</span>
          <button onClick={() => buscar()} className="text-xs font-medium underline hover:no-underline cursor-pointer shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {res && res.candidatos.length === 0 && (
        <div className="text-center py-16 rounded-xl border border-border">
          <svg className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803M10.5 7.5v6m3-3h-6" />
          </svg>
          <p className="text-sm font-semibold text-foreground">Nenhum lote encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">Tente informar mais campos ou verificar a quadra/conjunto.</p>
        </div>
      )}

      {res && res.candidatos.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONF[res.confianca].cls}`}>{CONF[res.confianca].label}</span>
            <span className="text-sm text-muted-foreground">{res.candidatos.length} lote(s) encontrado(s)</span>
          </div>

          <div className="space-y-2">
            {res.candidatos.slice(0, 15).map((c, i) => {
              const melhor = i === 0
              const pct = Math.round(c.score * 100)
              return (
                <div key={i} className={`rounded-lg border p-3 cursor-pointer transition-opacity hover:opacity-90 ${melhor ? 'border-[var(--chart-1)]/40 bg-[var(--chart-1)]/5' : 'border-white/8 bg-card'}`}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                      <span className="text-sm font-medium truncate">{c.endereco ?? c.lote.end_cart ?? '—'}</span>
                      {c.loteMatch && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0">lote ✓</span>}
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--chart-1)' }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--chart-1)' }} />
                  </div>
                  <div className="flex gap-4 text-[11px] text-muted-foreground font-mono">
                    {c.lote.area_proj != null && <span>área {c.lote.area_proj}m²</span>}
                    <span>end {Math.round(c.addrScore * 100)}%</span>
                    {c.areaScore != null && <span>área-match {Math.round(c.areaScore * 100)}%</span>}
                    {c.distancia_m != null && <span>{c.distancia_m}m</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
