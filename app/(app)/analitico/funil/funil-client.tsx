'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, LabelList,
} from 'recharts'
import { fmtBRL } from '@/lib/formatters'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Stats = {
  oportunidades: number; leads: number; visitados: number
  captados: number; taxa_perda: number; em_andamento: number
  valor_medio_geral: number | null; valor_medio_leads: number | null
  valor_medio_visitados: number | null; valor_medio_captados: number | null
  dias_leads: number | null; dias_contato: number | null
  dias_visita: number | null; dias_fechado: number | null
}
type Motivo         = { motivo: string; total: number }
type Fase           = { fase: string; cards: number }
type PorBairro      = { bairro: string; oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorTipo        = { tipo: string;   oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorMes         = { mes: string; oportunidades: number; captados: number; ticket_medio: number | null }
type Origem         = { origem: string; total: number; captados: number }
type PorResponsavel = { pessoa: string; oportunidades: number; captados: number; perdidos: number }

type Data = {
  stats: Stats
  motivos: Motivo[]; fases: Fase[]
  porBairro: PorBairro[]; porTipo: PorTipo[]; porMes: PorMes[]
  origem: Origem[]; porResponsavel: PorResponsavel[]
  bairros: string[]; tipos: string[]
}

// ── Paleta ────────────────────────────────────────────────────────────────────

const C = {
  oportunidades: '#6366f1',
  leads:         '#8b5cf6',
  visitados:     '#f59e0b',
  captados:      '#22c55e',
  perda:         '#ef4444',
  andamento:     '#06b6d4',
  perdidos:      '#ef4444',
}

const DONUT_COLORS = ['#ef4444','#f97316','#eab308','#06b6d4','#8b5cf6','#ec4899','#6366f1','#22c55e','#14b8a6']

const FASES_CORES: Record<string, string> = {
  'Leads':                   '#8b5cf6',
  'Em Contato':              '#06b6d4',
  'Lead Completo':           '#6366f1',
  'Para Visitar':            '#f59e0b',
  'Visita':                  '#f59e0b',
  'Captação Realizada ✅':   '#22c55e',
  'Avaliação':               '#f97316',
  'Fechado Comercialmente':  '#16a34a',
  'Matricula Solicitada':    '#10b981',
  'Ônus Solicitada':         '#10b981',
  'Não Captado ❌':          '#ef4444',
  'Locado / Retirado':       '#94a3b8',
}

const ORIGEM_CORES: Record<string, string> = {
  'DFImóveis': '#0ea5e9',
  'WImóveis':  '#22c55e',
  'OLX':       '#f97316',
  'Facebook':  '#3b82f6',
  'Nidos':     '#8b5cf6',
  'Outro':     '#a78bfa',
  'Sem link':  '#94a3b8',
}

const RANGE_OPTS = [
  { value: 'tudo', label: 'Desde 2024' },
  { value: 'ano',  label: 'Este ano'   },
  { value: '90d',  label: 'Últ. 90d'  },
  { value: '30d',  label: 'Últ. 30d'  },
  { value: '7d',   label: 'Últ. 7d'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMes(mes: string) {
  const [y, m] = mes.split('-')
  return `${m}/${y?.slice(2)}`
}

function fmtK(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null
  return n >= 1000 ? `ø R$${Math.round(n / 1000)}k` : `ø R$${n}`
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
function FunilVisual({ stats }: { stats: Stats }) {
  const max = stats.oportunidades || 1
  const stages = [
    { label: 'Oportunidades', value: stats.oportunidades, color: C.oportunidades, valor: stats.valor_medio_geral,     time: null },
    { label: 'c/ Contato',    value: stats.leads,          color: C.leads,          valor: stats.valor_medio_leads,    time: stats.dias_leads },
    { label: 'Visitados',     value: stats.visitados,      color: C.visitados,      valor: stats.valor_medio_visitados, time: stats.dias_visita },
    { label: 'Captados',      value: stats.captados,       color: C.captados,       valor: stats.valor_medio_captados, time: stats.dias_fechado },
  ]

  return (
    <div className="card rounded-lg p-3">
      <div className="flex items-stretch gap-1">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const pct  = prev ? Math.round((stage.value / Math.max(1, prev.value)) * 100) : null
          const barW = Math.max(6, Math.round((stage.value / max) * 100))
          const cc   = pct != null ? convColor(pct) : ''
          const avg  = fmtK(stage.valor)

          return (
            <Fragment key={stage.label}>
              {pct != null && (
                <div className="flex flex-col items-center justify-center shrink-0 px-1">
                  <span className="text-[10px] font-bold font-mono leading-none" style={{ color: cc }}>{pct}%</span>
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                    <path d="M0 5 H12 M9 2 L14 5 L9 8" stroke={cc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
                  {avg && <p className="text-[10px] font-mono font-semibold" style={{ color: stage.color }}>{avg}</p>}
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

// Origem por responsável — barra empilhada horizontal
function PessoaChart({ data }: { data: PorResponsavel[] }) {
  const max = Math.max(...data.map(d => d.oportunidades), 1)
  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      {data.map(d => {
        const pctCap = Math.round((d.captados / Math.max(1, d.oportunidades)) * 100)
        const cc = pctCap >= 20 ? '#22c55e' : pctCap >= 10 ? '#f59e0b' : '#94a3b8'
        return (
          <div key={d.pessoa} className="flex items-center gap-2">
            <span className="w-28 text-[10px] text-muted-foreground text-right truncate shrink-0">{d.pessoa}</span>
            <div className="flex-1 h-5 rounded overflow-hidden bg-muted/30 relative">
              <div className="h-full rounded absolute top-0 left-0 transition-all duration-700"
                style={{ width: `${Math.max(4, (d.oportunidades / max) * 100)}%`, background: '#6366f130' }} />
              {d.captados > 0 && (
                <div className="h-full rounded absolute top-0 left-0 transition-all duration-700"
                  style={{ width: `${Math.max(2, (d.captados / max) * 100)}%`, background: '#22c55e' }} />
              )}
            </div>
            <span className="text-[10px] font-mono shrink-0 w-10 text-right text-muted-foreground">{d.captados}/{d.oportunidades}</span>
            <span className="text-[10px] font-bold tabular shrink-0 w-8 text-right" style={{ color: cc }}>{pctCap}%</span>
          </div>
        )
      })}
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
    name:  d.motivo,
    value: d.total,
    pct:   Math.round(d.total * 100 / (total || 1)),
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
        <Bar dataKey="total"    name="Oportunidades" radius={[3,3,0,0]}>
          {data.map((d, i) => <Cell key={i} fill={ORIGEM_CORES[d.origem] ?? '#6366f1'} />)}
        </Bar>
        <Bar dataKey="captados" name="Captados" fill={C.captados} radius={[3,3,0,0]} />
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
  const [bairro,  setBairro]  = useState('Todos')
  const [tipo,    setTipo]    = useState('Todos')
  const [range,   setRange]   = useState('tudo')
  const [data,    setData]    = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (b: string, t: string, r: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipefy/funil?bairro=${encodeURIComponent(b)}&tipo_imovel=${encodeURIComponent(t)}&range=${r}`)
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(bairro, tipo, range) }, [bairro, tipo, range, load])

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
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RANGE_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => setRange(o.value)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  range === o.value
                    ? 'bg-primary text-white'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select value={bairro} onChange={e => setBairro(e.target.value)}
            className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {(data?.bairros ?? ['Todos']).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)}
            className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {(data?.tipos ?? ['Todos']).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Row 1 — Funil visual com valores */}
      {s && <FunilVisual stats={s} />}

      {/* Row 2 — Origem por portal + Origem por pessoa */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <PanelCard title="Origem por Portal">
          {data?.origem?.length
            ? <OrigemChart data={data.origem} />
            : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
        <PanelCard title="Origem por Responsável">
          {data?.porResponsavel?.length
            ? <PessoaChart data={data.porResponsavel} />
            : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

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
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2,2,0,0]} />
              <Bar dataKey="perdidos"      name="Perdidos"      fill={C.perdidos}      radius={[2,2,0,0]} />
              <Bar dataKey="captados"      name="Captados"      fill={C.captados}      radius={[2,2,0,0]} />
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
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2,2,0,0]} />
              <Bar dataKey="perdidos"      name="Perdidos"      fill={C.perdidos}      radius={[2,2,0,0]} />
              <Bar dataKey="captados"      name="Captados"      fill={C.captados}      radius={[2,2,0,0]} />
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
