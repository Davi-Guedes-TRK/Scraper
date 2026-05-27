'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, LabelList,
} from 'recharts'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Stats = {
  oportunidades: number; leads: number; visitados: number
  captados: number; taxa_perda: number; em_andamento: number
}
type Motivo    = { motivo: string; total: number }
type Fase      = { fase: string; cards: number }
type PorBairro = { bairro: string; oportunidades: number; perdidos: number; captados: number }
type PorTipo   = { tipo: string; oportunidades: number; perdidos: number; captados: number }
type PorMes    = { mes: string; oportunidades: number }
type Origem    = { origem: string; total: number; captados: number }

type Data = {
  stats: Stats; motivos: Motivo[]; fases: Fase[]
  porBairro: PorBairro[]; porTipo: PorTipo[]; porMes: PorMes[]
  origem: Origem[]; bairros: string[]; tipos: string[]
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
  'Leads': '#8b5cf6',
  'Em Contato': '#06b6d4',
  'Lead Completo': '#6366f1',
  'Visita': '#f59e0b',
  'Captação Realizada ✅': '#22c55e',
  'Avaliação': '#f97316',
  'Fechado Comercialmente': '#16a34a',
  'Matricula Solicitada': '#10b981',
  'Ônus Solicitada': '#10b981',
  'Não Captado ❌': '#ef4444',
  'Locado / Retirado': '#94a3b8',
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

function StatCard({ label, value, color, unit }: { label: string; value: number | null; color: string; unit?: string }) {
  return (
    <div
      className="rounded-lg flex flex-col items-center justify-center py-5 px-3 cursor-default transition-all duration-200 hover:scale-[1.03] hover:shadow-lg select-none"
      style={{ background: color + '1a', border: `1px solid ${color}40` }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-center" style={{ color }}>
        {label}
      </p>
      <p className="text-3xl font-extrabold font-display tabular leading-none" style={{ color }}>
        {value ?? '—'}{unit}
      </p>
    </div>
  )
}

function FunilGauge({ stats }: { stats: Stats }) {
  const max = stats.oportunidades || 1
  const stages = [
    { label: 'Oportunidades', value: stats.oportunidades, color: C.oportunidades },
    { label: 'Leads',         value: stats.leads,         color: C.leads },
    { label: 'Visitados',     value: stats.visitados,     color: C.visitados },
    { label: 'Captados',      value: stats.captados,      color: C.captados },
  ]
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      {stages.map(s => {
        const pct = Math.max(3, (s.value / max) * 100)
        return (
          <div key={s.label} className="flex items-center gap-3 group">
            <span className="w-28 text-xs text-right text-muted-foreground shrink-0 group-hover:text-foreground transition-colors">
              {s.label}
            </span>
            <div className="flex-1 h-9 rounded overflow-hidden bg-muted/40">
              <div
                className="h-full rounded flex items-center justify-end pr-3 text-white text-sm font-bold transition-all duration-700"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }}
              >
                {s.value}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Tooltip customizado para o donut — mostra nome + valor + %
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
      <ResponsiveContainer width={180} height={200}>
        <PieChart>
          <Pie data={items} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" paddingAngle={2}>
            {items.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto max-h-48 pr-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs group hover:bg-muted/30 rounded px-1 py-0.5 transition-colors">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
            <span className="flex-1 text-foreground truncate">{item.name}</span>
            <span className="font-bold tabular shrink-0" style={{ color: item.color }}>{item.value}</span>
            <span className="text-muted-foreground/60 shrink-0 w-9 text-right">{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FasesChart({ data }: { data: Fase[] }) {
  const sorted = [...data].sort((a, b) => a.cards - b.cards)
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 28 + 20)}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="fase" tick={{ fontSize: 10 }} width={155} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v: number, _: string, p: { payload: Fase }) => [v, p.payload.fase]} />
        <Bar dataKey="cards" radius={[0, 3, 3, 0]} isAnimationActive>
          <LabelList dataKey="cards" position="right" style={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} />
          {sorted.map((f, i) => (
            <Cell key={i} fill={FASES_CORES[f.fase] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function OrigemChart({ data }: { data: Origem[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="origem" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="total"    name="Oportunidades" radius={[3,3,0,0]}>
          {data.map((d, i) => <Cell key={i} fill={ORIGEM_CORES[d.origem] ?? '#6366f1'} />)}
        </Bar>
        <Bar dataKey="captados" name="Captados" fill={C.captados} radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
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
          {/* Range */}
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

      {/* Row 1 — 6 Stats */}
      <div className="grid grid-cols-6 gap-2.5">
        <StatCard label="Oportunidades"     value={s?.oportunidades ?? null} color={C.oportunidades} />
        <StatCard label="Leads (c/ contato)" value={s?.leads         ?? null} color={C.leads} />
        <StatCard label="Visitados"          value={s?.visitados     ?? null} color={C.visitados} />
        <StatCard label="Captados"           value={s?.captados      ?? null} color={C.captados} />
        <StatCard label="Taxa de Perda"      value={s?.taxa_perda    ?? null} color={C.perda}    unit="%" />
        <StatCard label="Em Andamento"       value={s?.em_andamento  ?? null} color={C.andamento} />
      </div>

      {/* Row 2 — Funil + Origem do Lead */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <PanelCard title="Funil de Conversão">
          {s && <FunilGauge stats={s} />}
        </PanelCard>
        <PanelCard title="Origem do Lead (portal)">
          {data?.origem?.length
            ? <OrigemChart data={data.origem} />
            : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

      {/* Row 3 — Motivos + Fases */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '11fr 13fr' }}>
        <PanelCard title="Motivos de Não Captação">
          {data?.motivos?.length
            ? <DonutChart data={data.motivos} />
            : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
        </PanelCard>
        <PanelCard title="Distribuição por Fase Atual">
          {data?.fases?.length
            ? <FasesChart data={data.fases} />
            : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

      {/* Row 4 — Por Bairro + Por Tipo */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '14fr 10fr' }}>
        <PanelCard title="Por Bairro">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.porBairro ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="bairro" tick={{ fontSize: 10 }} tickLine={false} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2,2,0,0]} />
              <Bar dataKey="perdidos"      name="Perdidos"      fill={C.perdidos}      radius={[2,2,0,0]} />
              <Bar dataKey="captados"      name="Captados"      fill={C.captados}      radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>

        <PanelCard title="Por Tipo de Imóvel">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.porTipo ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="tipo" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2,2,0,0]} />
              <Bar dataKey="perdidos"      name="Perdidos"      fill={C.perdidos}      radius={[2,2,0,0]} />
              <Bar dataKey="captados"      name="Captados"      fill={C.captados}      radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>

      {/* Row 5 — Novas Oportunidades por Mês */}
      <PanelCard title="Novas Oportunidades por Mês">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={(data?.porMes ?? []).map(d => ({ ...d, mes: fmtMes(d.mes) }))}
            margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line
              type="linear" dataKey="oportunidades" name="Oportunidades"
              stroke={C.oportunidades} strokeWidth={2}
              dot={{ r: 3, fill: C.oportunidades, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>

    </div>
  )
}
