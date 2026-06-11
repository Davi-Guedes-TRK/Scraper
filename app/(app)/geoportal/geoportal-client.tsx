'use client'

import { useState } from 'react'

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
  const [form, setForm] = useState<Record<string, string>>({ endereco: '', quadra: '', conjunto: '', casa_lote: '', area_m2: '' })
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const buscar = async () => {
    setLoading(true); setErro(null); setRes(null)
    const body: Record<string, unknown> = {}
    if (form.endereco)  body.endereco  = form.endereco
    if (form.quadra)    body.quadra    = form.quadra
    if (form.conjunto)  body.conjunto  = form.conjunto
    if (form.casa_lote) body.casa_lote = form.casa_lote
    if (form.area_m2)   body.area_m2   = parseFloat(form.area_m2.replace(',', '.'))
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
          onClick={buscar}
          disabled={loading}
          className="mt-4 h-9 px-5 rounded-lg text-sm font-semibold bg-[var(--chart-1)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          {loading
            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Buscando…</>
            : 'Buscar candidatos'}
        </button>
      </div>

      {erro && <div className="rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4">{erro}</div>}

      {res && (
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
                <div key={i} className={`rounded-lg border p-3 ${melhor ? 'border-[var(--chart-1)]/40 bg-[var(--chart-1)]/5' : 'border-white/8 bg-card'}`}>
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
