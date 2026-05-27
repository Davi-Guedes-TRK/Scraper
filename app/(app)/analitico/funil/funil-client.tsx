'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
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

type Data = {
  stats: Stats; motivos: Motivo[]; fases: Fase[]
  porBairro: PorBairro[]; porTipo: PorTipo[]; porMes: PorMes[]
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

const DONUT_COLORS = ['#ef4444','#f97316','#eab308','#06b6d4','#8b5cf6','#ec4899','#6366f1','#22c55e']

const FASES_COLORS: Record<string, string> = {
  'Leads': '#8b5cf6',
  'Em Contato': '#06b6d4',
  'Lead Completo': '#6366f1',
  'Visita': '#f59e0b',
  'Captação Realizada ✅': '#22c55e',
  'Avaliação': '#f97316',
  'Fechado Comercialmente': '#22c55e',
  'Matricula Solicitada': '#10b981',
  'Ônus Solicitada': '#10b981',
  'Não Captado ❌': '#ef4444',
  'Locado / Retirado': '#94a3b8',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMes(mes: string) {
  const [y, m] = mes.split('-')
  return `${m}/${y?.slice(2)}`
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v}%`
}

// ── Componentes internos ──────────────────────────────────────────────────────

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-3 pt-3">
      {children}
    </p>
  )
}

function StatCard({ label, value, color, unit }: { label: string; value: number | null; color: string; unit?: string }) {
  return (
    <div className="rounded-lg flex flex-col items-center justify-center py-5 px-3" style={{ background: color + '22', border: `1px solid ${color}44` }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color }}>{label}</p>
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
        const pct = Math.max(2, (s.value / max) * 100)
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-28 text-xs text-right text-muted-foreground shrink-0">{s.label}</span>
            <div className="flex-1 h-9 rounded overflow-hidden bg-muted/40">
              <div
                className="h-full rounded flex items-center justify-end pr-3 text-white text-sm font-bold transition-all duration-500"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${s.color}99, ${s.color})` }}
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

function DonutChart({ data }: { data: Motivo[] }) {
  const items = data.map((d, i) => ({ name: d.motivo, value: d.total, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="flex gap-4 items-start h-full">
      <ResponsiveContainer width={200} height={220}>
        <PieChart>
          <Pie data={items} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
            {items.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} (${Math.round(v * 100 / (total || 1))}%)`, '']} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto max-h-52 pt-2 pr-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
            <span className="flex-1 text-foreground truncate">{item.name}</span>
            <span className="font-semibold tabular text-muted-foreground shrink-0">{item.value}</span>
            <span className="text-muted-foreground/60 shrink-0 w-10 text-right">{Math.round(item.value * 100 / (total || 1))}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FunilClient() {
  const [bairro,  setBairro]  = useState('Todos')
  const [tipo,    setTipo]    = useState('Todos')
  const [data,    setData]    = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async (b: string, t: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pipefy/funil?bairro=${encodeURIComponent(b)}&tipo_imovel=${encodeURIComponent(t)}`)
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch_(bairro, tipo) }, [bairro, tipo, fetch_])

  const s = data?.stats

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto" style={{ minHeight: 0 }}>

      {/* Header + Filtros */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Funil de Captação</h1>
          <p className="text-[13px] text-muted-foreground">Pipefy — desde jan/2024{loading && <span className="ml-2 text-muted-foreground/50">carregando…</span>}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={bairro}
            onChange={e => setBairro(e.target.value)}
            className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(data?.bairros ?? ['Todos']).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(data?.tipos ?? ['Todos']).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Row 1 — 6 Stats */}
      <div className="grid grid-cols-6 gap-2.5">
        <StatCard label="Oportunidades" value={s?.oportunidades ?? null} color={C.oportunidades} />
        <StatCard label="Leads (c/ contato)" value={s?.leads ?? null} color={C.leads} />
        <StatCard label="Visitados" value={s?.visitados ?? null} color={C.visitados} />
        <StatCard label="Captados" value={s?.captados ?? null} color={C.captados} />
        <StatCard label="Taxa de Perda" value={s?.taxa_perda ?? null} color={C.perda} unit="%" />
        <StatCard label="Em Andamento" value={s?.em_andamento ?? null} color={C.andamento} />
      </div>

      {/* Row 2 — Funil de Conversão */}
      <div className="card rounded-lg">
        <CardTitle>Funil de Conversão</CardTitle>
        {s && <FunilGauge stats={s} />}
      </div>

      {/* Row 3 — Motivos + Fases */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '11fr 13fr' }}>

        <div className="card rounded-lg">
          <CardTitle>Motivos de Não Captação</CardTitle>
          <div className="px-3 pb-3">
            {data?.motivos?.length
              ? <DonutChart data={data.motivos} />
              : <p className="text-xs text-muted-foreground py-8 text-center">Sem dados</p>}
          </div>
        </div>

        <div className="card rounded-lg">
          <CardTitle>Distribuição por Fase Atual</CardTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.fases ?? []} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="fase" tick={{ fontSize: 10 }} width={150} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="cards" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10 }}>
                {(data?.fases ?? []).map((f, i) => (
                  <Cell key={i} fill={FASES_COLORS[f.fase] ?? '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 4 — Por Bairro + Por Tipo */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '14fr 10fr' }}>

        <div className="card rounded-lg">
          <CardTitle>Por Bairro</CardTitle>
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
        </div>

        <div className="card rounded-lg">
          <CardTitle>Por Tipo de Imóvel</CardTitle>
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
        </div>
      </div>

      {/* Row 5 — Novas Oportunidades por Mês */}
      <div className="card rounded-lg">
        <CardTitle>Novas Oportunidades por Mês</CardTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={(data?.porMes ?? []).map(d => ({ ...d, mes: fmtMes(d.mes) }))} margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line type="linear" dataKey="oportunidades" name="Oportunidades" stroke={C.oportunidades} strokeWidth={2} dot={{ r: 3, fill: C.oportunidades }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
