'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, LabelList,
} from 'recharts'
import { fmtBRL } from '@/lib/formatters'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Stats = {
  oportunidades: number; qualificados: number; negociacao: number
  captados: number; taxa_perda: number; em_andamento: number
  valor_geral: number | null; valor_qualificados: number | null
  valor_negociacao: number | null; valor_captados: number | null
  dias_oportunidades: number | null; dias_qualificacao: number | null
  dias_negociacao: number | null; dias_captado: number | null
}
type Motivo = { motivo: string; total: number }
type Fase = { fase: string; cards: number }
type PorBairro = { bairro: string; oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorTipo = { tipo: string; oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorMes = { mes: string; oportunidades: number; captados: number; ticket_medio: number | null }
type Origem = { origem: string; total: number; captados: number }

type Data = {
  stats: Stats
  motivos: Motivo[]; fases: Fase[]
  porBairro: PorBairro[]; porTipo: PorTipo[]; porMes: PorMes[]
  origem: Origem[]
  anunciosAtivos: number
  anunciosValor: number
  bairros: string[]; tipos: string[]
}

// ── Paleta ────────────────────────────────────────────────────────────────────

const C = {
  anuncios: '#94a3b8',
  oportunidades: '#4f46e5',
  leads: '#6366f1',
  visitados: '#818cf8',
  captados: '#16a34a',
  perda: '#ef4444',
  andamento: '#818cf8',
  perdidos: '#ef4444',
}

const DONUT_COLORS = ['#ef4444', '#f59e0b', '#a78bfa', '#818cf8', '#8b5cf6', '#a78bfa', '#6366f1', '#22c55e', '#14b8a6']

const FASES_CORES: Record<string, string> = {
  'Informações Básicas': '#8b5cf6',
  'Qualificação': '#818cf8',
  'Negociação': '#f59e0b',
  'Captado': '#22c55e',
  'Não Captado': '#ef4444',
}

const ORIGEM_CORES: Record<string, string> = {
  'Portal': '#6366f1',
  'Placas/Procura Externa': '#f59e0b',
  'Captado por Corretor': '#22c55e',
  'Sem origem': '#94a3b8',
}

const RANGE_OPTS = [
  { value: 'tudo', label: 'Desde 2024' },
  { value: 'ano', label: 'Este ano' },
  { value: '90d', label: 'Últ. 90d' },
  { value: '30d', label: 'Últ. 30d' },
  { value: '7d', label: 'Últ. 7d' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMes(mes: string) {
  const [y, m] = mes.split('-')
  return `${m}/${y?.slice(2)}`
}

function fmtK(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null
  if (n >= 1_000_000) return `R$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `R$${Math.round(n / 1_000)}k`
  return `R$${n}`
}

function convColor(pct: number) {
  return pct >= 50 ? '#22c55e' : pct >= 25 ? '#f59e0b' : '#ef4444'
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function PanelCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card rounded-lg transition-shadow duration-200 hover:shadow-md ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-3 pb-2">
        {title}
      </p>
      {children}
    </div>
  )
}

// Funil horizontal com valores financeiros por etapa
function FunilVisual({ stats, anuncios, anunciosValor }: { stats: Stats; anuncios: number; anunciosValor: number }) {
  const max = Math.max(anuncios, stats.oportunidades, 1)
  const stages = [
    { label: 'Anúncios Ativos', value: anuncios, color: C.anuncios, valor: anunciosValor, time: null },
    { label: 'Oportunidades', value: stats.oportunidades, color: C.oportunidades, valor: stats.valor_geral, time: stats.dias_oportunidades },
    { label: 'Qualificadas', value: stats.qualificados, color: C.leads, valor: stats.valor_qualificados, time: stats.dias_qualificacao },
    { label: 'Negociação', value: stats.negociacao, color: C.visitados, valor: stats.valor_negociacao, time: stats.dias_negociacao },
    { label: 'Captadas', value: stats.captados, color: C.captados, valor: stats.valor_captados, time: stats.dias_captado },
  ]

  return (
    <div className="card rounded-lg p-3">
      <div className="flex items-stretch gap-1">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const pct = prev ? Math.round((stage.value / Math.max(1, prev.value)) * 100) : null
          const barW = Math.max(6, Math.round((stage.value / max) * 100))
          const cc = pct != null ? convColor(pct) : ''
          const valorFmt = fmtK(stage.valor)

          return (
            <Fragment key={stage.label}>
              {pct != null && (
                <div className="flex flex-col items-center justify-center shrink-0 px-1">
                  <span className="text-[10px] font-bold font-mono leading-none" style={{ color: cc }}>{pct}%</span>
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                    <path d="M0 5 H12 M9 2 L14 5 L9 8" stroke={cc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div
                className="flex-1 rounded-xl px-3 py-2.5 flex flex-col gap-1 select-none"
                style={{ background: stage.color + '12', border: `1px solid ${stage.color}28` }}
              >
                <div className="h-1 rounded-full overflow-hidden" style={{ background: stage.color + '28' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barW}%`, background: stage.color }} />
                </div>
                <p className="text-2xl font-extrabold tabular leading-none mt-0.5" style={{ color: stage.color }}>{stage.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stage.label}</p>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {valorFmt && <p className="text-[10px] font-mono font-semibold" style={{ color: stage.color }}>{valorFmt}</p>}
                  {stage.time != null && stage.time > 0 && (
                    <p className="text-[10px] font-mono text-muted-foreground/70">~{stage.time}d na fase</p>
                  )}
                </div>
              </div>
            </Fragment>
          )
        })}

        {/* métricas secundárias */}
        <div className="ml-2 pl-3 border-l border-border flex flex-col gap-3 justify-center shrink-0 pr-1">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">Taxa de Perda</p>
            <p className="text-xl font-extrabold tabular mt-1 leading-none" style={{ color: C.perda }}>{stats.taxa_perda ?? 0}%</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">Em Andamento</p>
            <p className="text-xl font-extrabold tabular mt-1 leading-none" style={{ color: C.andamento }}>{stats.em_andamento ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Tooltip customizado para donut
function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { pct: number } }[] }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-0.5">{name}</p>
      <p className="text-muted-foreground">{value} ({p.pct}%)</p>
    </div>
  )
}

function DonutChart({ data }: { data: Motivo[] }) {
  const total = data.reduce((s, d) => s + d.total, 0)
  const items = data.map((d, i) => ({
    name: d.motivo,
    value: d.total,
    pct: Math.round(d.total * 100 / (total || 1)),
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }))
  return (
    <div className="flex gap-3 px-3 pb-3">
      <ResponsiveContainer width={140} height={160}>
        <PieChart>
          <Pie data={items} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
            {items.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1 flex-1 justify-center">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: item.color }} />
            <span className="flex-1 text-foreground truncate">{item.name}</span>
            <span className="font-bold tabular shrink-0" style={{ color: item.color }}>{item.value}</span>
            <span className="text-muted-foreground/60 shrink-0 w-8 text-right">{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FasesChart({ data }: { data: Fase[] }) {
  const sorted = [...data].sort((a, b) => a.cards - b.cards)
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, sorted.length * 22 + 16)}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 48, top: 2, bottom: 2 }}>
        <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="fase" tick={{ fontSize: 9 }} width={150} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v: number, _: string, p: { payload?: Fase }) => [v, p.payload?.fase ?? '']} />
        <Bar dataKey="cards" radius={[0, 3, 3, 0]} isAnimationActive>
          <LabelList dataKey="cards" position="right" style={{ fontSize: 9, fill: 'var(--foreground)', fontWeight: 600 }} />
          {sorted.map((f, i) => <Cell key={i} fill={FASES_CORES[f.fase] ?? '#6366f1'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function OrigemChart({ data }: { data: Origem[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="origem" tick={{ fontSize: 10 }} tickLine={false} />
        <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="total" name="Oportunidades" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={ORIGEM_CORES[d.origem] ?? '#6366f1'} />)}
        </Bar>
        <Bar dataKey="captados" name="Captados" fill={C.captados} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ValorTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; payload?: { valor_medio?: number | null } }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const valorMedio = payload[0]?.payload?.valor_medio
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs min-w-[130px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold tabular">{p.value}</span>
        </div>
      ))}
      {valorMedio != null && valorMedio > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/60 flex justify-between">
          <span className="text-muted-foreground">Valor médio</span>
          <span className="font-bold text-foreground">{fmtBRL(valorMedio)}</span>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FunilClient() {
  const [bairro,     setBairro]     = useState('Todos')
  const [tipo,       setTipo]       = useState('Todos')
  const [range,      setRange]      = useState('ano')
  const [showCustom, setShowCustom] = useState(false)
  const [customDe,   setCustomDe]   = useState('')
  const [customAte,  setCustomAte]  = useState('')
  const [data,       setData]       = useState<Data | null>(null)
  const [loading,    setLoading]    = useState(true)

  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async (b: string, t: string, r: string, de?: string, ate?: string) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ bairro: b, tipo_imovel: t })
      if (de && ate) { p.set('desde', de); p.set('ate', ate) }
      else           { p.set('range', r) }
      const res = await fetch(`/api/pipefy/funil?${p}`, { cache: 'no-store' })
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const customAtivo = showCustom && !!customDe && !!customAte

  useEffect(() => {
    if (customAtivo) load(bairro, tipo, range, customDe, customAte)
    else             load(bairro, tipo, range)
  }, [bairro, tipo, range, customAtivo, customDe, customAte, load])

  const s = data?.stats

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto" style={{ minHeight: 0 }}>

      {/* Header + Filtros */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Funil de Captação</h1>
          <p className="text-[13px] text-muted-foreground">
            Pipefy{loading && <span className="ml-2 opacity-50">carregando…</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-2 items-center flex-wrap">
            {/* Presets de período */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {RANGE_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => { setRange(o.value); setShowCustom(false) }}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    !customAtivo && range === o.value
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {/* Toggle período customizado */}
            <button
              onClick={() => setShowCustom(v => !v)}
              title="Período personalizado"
              className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors ${
                customAtivo
                  ? 'bg-primary text-white border-primary'
                  : showCustom
                    ? 'bg-muted text-foreground border-border'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            {/* Selects bairro/tipo */}
            <select value={bairro} onChange={e => setBairro(e.target.value)}
              className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              {(data?.bairros ?? ['Todos']).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              {(data?.tipos ?? ['Todos']).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Período customizado — retraído por padrão */}
          {showCustom && (
            <div className="flex items-center gap-2 pr-0.5">
              <span className="text-[11px] text-muted-foreground">De</span>
              <input type="date" value={customDe} max={customAte || today}
                onChange={e => setCustomDe(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-[11px] text-muted-foreground">Até</span>
              <input type="date" value={customAte} min={customDe || undefined} max={today}
                onChange={e => setCustomAte(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              {customAtivo
                ? <span className="text-[10px] font-semibold text-primary">● ativo</span>
                : <span className="text-[10px] text-muted-foreground">selecione as duas datas</span>
              }
            </div>
          )}
        </div>
      </div>

      {/* Row 1 — Funil visual com valores */}
      {s && <FunilVisual stats={s} anuncios={data?.anunciosAtivos ?? 0} anunciosValor={data?.anunciosValor ?? 0} />}

      {/* Row 2 — Origem da oportunidade */}
      <PanelCard title="Origem da Oportunidade">
        {data?.origem?.length
          ? <OrigemChart data={data.origem} />
          : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
      </PanelCard>

      {/* Row 3 — Motivos + Fases */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '11fr 13fr' }}>
        <PanelCard title="Motivos de Não Captação">
          {data?.motivos?.length
            ? <DonutChart data={data.motivos} />
            : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
        <PanelCard title="Distribuição por Fase Atual">
          {data?.fases?.length
            ? <FasesChart data={data.fases} />
            : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

      {/* Row 4 — Por Bairro + Por Tipo */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '14fr 10fr' }}>
        <PanelCard title="Por Bairro">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.porBairro ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="bairro" tick={{ fontSize: 9 }} tickLine={false} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ValorTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2, 2, 0, 0]} />
              <Bar dataKey="perdidos" name="Perdidos" fill={C.perdidos} radius={[2, 2, 0, 0]} />
              <Bar dataKey="captados" name="Captados" fill={C.captados} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>

        <PanelCard title="Por Tipo de Imóvel">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.porTipo ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="tipo" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ValorTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2, 2, 0, 0]} />
              <Bar dataKey="perdidos" name="Perdidos" fill={C.perdidos} radius={[2, 2, 0, 0]} />
              <Bar dataKey="captados" name="Captados" fill={C.captados} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>

      {/* Row 5 — Evolução mensal */}
      <PanelCard title="Evolução Mensal — Oportunidades e Captados">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart
            data={(data?.porMes ?? []).map(d => ({ ...d, mes: fmtMes(d.mes) }))}
            margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fontSize: 9 }} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v: number, name: string, p: { payload?: PorMes }) => {
                const rows: [string, string][] = [[name, String(v)]]
                if (name === 'Captados' && p.payload?.ticket_medio) {
                  rows.push(['Ticket médio', fmtBRL(p.payload.ticket_medio)])
                }
                return rows
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="linear" dataKey="oportunidades" name="Oportunidades"
              stroke={C.oportunidades} strokeWidth={2}
              dot={{ r: 3, fill: C.oportunidades, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Line type="linear" dataKey="captados" name="Captados"
              stroke={C.captados} strokeWidth={2}
              dot={{ r: 3, fill: C.captados, strokeWidth: 0 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>

    </div>
  )
}
