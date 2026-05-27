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
}

type Financeiro = {
  carteira_captada: number | null
  ticket_medio_captados: number | null
  qtd_captados_com_valor: number | null
  potencial_pipeline: number | null
  ticket_medio_geral: number | null
  mediana_anuncio: number | null
  faixa_0_10k: number; faixa_10_20k: number; faixa_20_30k: number
  faixa_30_50k: number; faixa_50k_plus: number
  dias_leads: number | null; dias_contato: number | null
  dias_visita: number | null; dias_fechado: number | null
}

type Motivo    = { motivo: string; total: number }
type Fase      = { fase: string; cards: number }
type PorBairro = { bairro: string; oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorTipo   = { tipo: string;   oportunidades: number; perdidos: number; captados: number; valor_medio: number | null }
type PorMes    = { mes: string; oportunidades: number; captados: number; ticket_medio: number | null }
type Origem    = { origem: string; total: number; captados: number }

type Data = {
  stats: Stats; financeiro: Financeiro | null
  motivos: Motivo[]; fases: Fase[]
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
  pipeline:      '#6366f1',
  mediana:       '#f97316',
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

// Funil horizontal — substitui os 6 StatCards
function FunilVisual({ stats, fin }: { stats: Stats; fin: Financeiro | null }) {
  const max = stats.oportunidades || 1
  const stages = [
    { label: 'Oportunidades', value: stats.oportunidades, color: C.oportunidades, time: null },
    { label: 'c/ Contato',    value: stats.leads,          color: C.leads,          time: fin?.dias_leads ?? null },
    { label: 'Visitados',     value: stats.visitados,      color: C.visitados,      time: fin?.dias_visita ?? null },
    { label: 'Captados',      value: stats.captados,       color: C.captados,       time: fin?.dias_fechado ?? null },
  ]

  return (
    <div className="card rounded-lg p-3">
      <div className="flex items-stretch gap-1">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const pct  = prev ? Math.round((stage.value / Math.max(1, prev.value)) * 100) : null
          const barW = Math.max(6, Math.round((stage.value / max) * 100))
          const cc   = pct != null ? convColor(pct) : ''

          return (
            <Fragment key={stage.label}>
              {/* seta de conversão */}
              {pct != null && (
                <div className="flex flex-col items-center justify-center shrink-0 px-1">
                  <span className="text-[10px] font-bold font-mono leading-none" style={{ color: cc }}>{pct}%</span>
                  <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                    <path d="M1 6 H14 M10 2 L16 6 L10 10" stroke={cc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              {/* card de estágio */}
              <div
                className="flex-1 rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-transform duration-200 hover:scale-[1.02] cursor-default select-none"
                style={{ background: stage.color + '12', border: `1px solid ${stage.color}28` }}
              >
                <div className="h-1 rounded-full overflow-hidden" style={{ background: stage.color + '28' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barW}%`, background: stage.color }} />
                </div>
                <p className="text-2xl font-extrabold tabular leading-none mt-0.5" style={{ color: stage.color }}>{stage.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stage.label}</p>
                {stage.time != null && stage.time > 0 && (
                  <p className="text-[10px] font-mono" style={{ color: stage.color + 'aa' }}>~{stage.time}d na fase</p>
                )}
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

// KPIs financeiros
function KpiCard({ label, value, sub, color, note }: { label: string; value: string; sub: string; color: string; note?: string }) {
  return (
    <div
      className="card rounded-lg px-4 py-3 flex flex-col gap-1 transition-shadow duration-200 hover:shadow-md cursor-default select-none"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold tabular leading-none text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
      {note && <p className="text-[10px] font-mono text-muted-foreground/60">{note}</p>}
    </div>
  )
}

// Faixas de valor do anúncio
function FaixasChart({ fin }: { fin: Financeiro }) {
  const data = [
    { faixa: 'até R$10k', count: fin.faixa_0_10k,   color: '#6366f1' },
    { faixa: 'R$10–20k',  count: fin.faixa_10_20k,  color: '#8b5cf6' },
    { faixa: 'R$20–30k',  count: fin.faixa_20_30k,  color: '#f59e0b' },
    { faixa: 'R$30–50k',  count: fin.faixa_30_50k,  color: '#f97316' },
    { faixa: '+R$50k',    count: fin.faixa_50k_plus, color: '#22c55e' },
  ]
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {data.map(d => (
        <div key={d.faixa} className="flex items-center gap-3 group">
          <span className="w-20 text-[11px] text-muted-foreground text-right shrink-0 group-hover:text-foreground transition-colors">{d.faixa}</span>
          <div className="flex-1 h-7 rounded overflow-hidden bg-muted/30">
            <div
              className="h-full rounded flex items-center justify-end pr-2 text-white text-xs font-bold transition-all duration-700"
              style={{ width: `${Math.max(10, (d.count / max) * 100)}%`, background: `linear-gradient(90deg, ${d.color}80, ${d.color})` }}
            >
              {d.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Velocidade média por fase
function VelocidadeChart({ fin }: { fin: Financeiro }) {
  const data = [
    { fase: 'Leads',       dias: fin.dias_leads    ?? 0, color: C.leads },
    { fase: 'Em Contato',  dias: fin.dias_contato  ?? 0, color: C.andamento },
    { fase: 'Visita',      dias: fin.dias_visita   ?? 0, color: C.visitados },
    { fase: 'Fechado',     dias: fin.dias_fechado  ?? 0, color: C.captados },
  ].filter(d => d.dias > 0)
  const max = Math.max(...data.map(d => d.dias), 1)
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {data.map(d => (
        <div key={d.fase} className="flex items-center gap-3 group">
          <span className="w-24 text-[11px] text-muted-foreground text-right shrink-0 group-hover:text-foreground transition-colors">{d.fase}</span>
          <div className="flex-1 h-7 rounded overflow-hidden bg-muted/30">
            <div
              className="h-full rounded flex items-center justify-end pr-2 text-white text-xs font-bold transition-all duration-700"
              style={{ width: `${Math.max(10, (d.dias / max) * 100)}%`, background: `linear-gradient(90deg, ${d.color}80, ${d.color})` }}
            >
              {d.dias}d
            </div>
          </div>
        </div>
      ))}
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

// Tooltip financeiro para Por Bairro / Por Tipo
function ValorTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const valorMedio = (payload[0]?.payload as { valor_medio?: number })?.valor_medio
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
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

  const s   = data?.stats
  const fin = data?.financeiro ?? null

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

      {/* Row 1 — Funil visual */}
      {s && <FunilVisual stats={s} fin={fin} />}

      {/* Row 2 — KPIs Financeiros */}
      <div className="grid grid-cols-4 gap-2.5">
        <KpiCard
          label="Carteira Captada"
          value={fmtBRL(fin?.carteira_captada ?? 0)}
          sub={`${fin?.qtd_captados_com_valor ?? 0} imóveis captados`}
          color={C.captados}
          note="soma do valor anunciado"
        />
        <KpiCard
          label="Ticket Médio Captados"
          value={fmtBRL(fin?.ticket_medio_captados ?? 0)}
          sub="média dos captados"
          color="#16a34a"
        />
        <KpiCard
          label="Potencial em Pipeline"
          value={fmtBRL(fin?.potencial_pipeline ?? 0)}
          sub="leads ainda em andamento"
          color={C.pipeline}
          note={`ticket médio geral: ${fmtBRL(fin?.ticket_medio_geral ?? 0)}`}
        />
        <KpiCard
          label="Mediana do Anúncio"
          value={fmtBRL(fin?.mediana_anuncio ?? 0)}
          sub="50% dos anúncios estão abaixo"
          color={C.mediana}
        />
      </div>

      {/* Row 3 — Faixas de Valor + Velocidade do Funil */}
      <div className="grid grid-cols-2 gap-2.5">
        <PanelCard title="Distribuição de Valor Anunciado">
          {fin
            ? <FaixasChart fin={fin} />
            : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
        </PanelCard>
        <PanelCard title="Velocidade Média por Fase (dias)">
          {fin
            ? <VelocidadeChart fin={fin} />
            : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

      {/* Row 4 — Origem do Lead */}
      <PanelCard title="Origem do Lead (portal)">
        {data?.origem?.length
          ? <OrigemChart data={data.origem} />
          : <p className="text-xs text-muted-foreground py-8 text-center px-3">Sem dados</p>}
      </PanelCard>

      {/* Row 5 — Motivos + Fases */}
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

      {/* Row 6 — Por Bairro + Por Tipo */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '14fr 10fr' }}>
        <PanelCard title="Por Bairro (valor médio anunciado no tooltip)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.porBairro ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="bairro" tick={{ fontSize: 10 }} tickLine={false} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ValorTooltip />} />
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
              <Tooltip content={<ValorTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="oportunidades" name="Oportunidades" fill={C.oportunidades} radius={[2,2,0,0]} />
              <Bar dataKey="perdidos"      name="Perdidos"      fill={C.perdidos}      radius={[2,2,0,0]} />
              <Bar dataKey="captados"      name="Captados"      fill={C.captados}      radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>

      {/* Row 7 — Oportunidades + Captados por Mês */}
      <PanelCard title="Evolução Mensal — Oportunidades e Captados">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={(data?.porMes ?? []).map(d => ({ ...d, mes: fmtMes(d.mes) }))}
            margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v: number, name: string, p: { payload: PorMes }) => {
                const rows: [string, string][] = [[name, String(v)]]
                if (name === 'Captados' && p.payload.ticket_medio) {
                  rows.push(['Ticket médio', fmtBRL(p.payload.ticket_medio)])
                }
                return rows
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="linear" dataKey="oportunidades" name="Oportunidades"
              stroke={C.oportunidades} strokeWidth={2}
              dot={{ r: 3, fill: C.oportunidades, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="linear" dataKey="captados" name="Captados"
              stroke={C.captados} strokeWidth={2}
              dot={{ r: 3, fill: C.captados, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>

    </div>
  )
}
