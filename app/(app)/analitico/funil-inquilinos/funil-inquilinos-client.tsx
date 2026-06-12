'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'

type Stats = {
  atendimentos: number; com_proposta: number; fechados: number
  ativos: number; perdidos: number; taxa_perda: number
}
type Motivo = { motivo: string; total: number }
type Canal = { canal: string; total: number; fechados: number }
type PorRegiao = { regiao: string; atendimentos: number; com_proposta: number; fechados: number }
type PorTipo = { tipo: string; atendimentos: number; fechados: number }
type PorMes = { mes: string; atendimentos: number; fechados: number; saidas_adm: number }
type Data = {
  stats: Stats; motivos: Motivo[]; canal: Canal[]
  porRegiao: PorRegiao[]; porTipo: PorTipo[]; porMes: PorMes[]
  regioes: string[]; tipos: string[]
}

const C = { atend: '#6366f1', proposta: '#f59e0b', fechado: '#22c55e', perda: '#ef4444', ativo: '#818cf8', saida: '#e879f9' }
const DONUT = ['#ef4444', '#f59e0b', '#a78bfa', '#818cf8', '#8b5cf6', '#a78bfa', '#6366f1', '#22c55e']
const CANAL_CORES: Record<string, string> = {
  'Telefone': '#6366f1', 'WhatsApp': '#22c55e', 'E-mail': '#f59e0b',
  'Portais': '#818cf8', 'Plantão / Faixa de Rua': '#a78bfa', 'Sem canal': '#94a3b8',
}
const RANGE_OPTS = [
  { value: 'tudo', label: 'Desde 2024' },
  { value: 'ano', label: 'Este ano' },
  { value: '90d', label: 'Últ. 90d' },
  { value: '30d', label: 'Últ. 30d' },
]

const fmtMes = (m: string) => { const [y, mm] = m.split('-'); return `${mm}/${y?.slice(2)}` }
const convColor = (p: number) => (p >= 50 ? '#22c55e' : p >= 25 ? '#f59e0b' : p >= 5 ? '#6366f1' : '#ef4444')

function PanelCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card rounded-lg transition-shadow duration-200 hover:shadow-md ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pt-3 pb-2">{title}</p>
      {children}
    </div>
  )
}

function FunilVisual({ stats }: { stats: Stats }) {
  const max = stats.atendimentos || 1
  const stages = [
    { label: 'Atendimentos', value: stats.atendimentos, color: C.atend, hint: 'procuraram alugar' },
    { label: 'Com Proposta', value: stats.com_proposta, color: C.proposta, hint: 'fizeram proposta' },
    { label: 'Fechados', value: stats.fechados, color: C.fechado, hint: 'alugaram' },
  ]
  return (
    <div className="card rounded-lg p-3">
      <div className="flex items-stretch gap-1">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const pct = prev ? Math.round((stage.value / Math.max(1, prev.value)) * 100) : null
          const barW = Math.max(6, Math.round((stage.value / max) * 100))
          const cc = pct != null ? convColor(pct) : ''
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
              <div className="flex-1 rounded-xl px-3 py-2.5 flex flex-col gap-1 select-none" style={{ background: stage.color + '12', border: `1px solid ${stage.color}28` }}>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: stage.color + '28' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barW}%`, background: stage.color }} />
                </div>
                <p className="text-2xl font-extrabold tabular leading-none mt-0.5" style={{ color: stage.color }}>{stage.value.toLocaleString('pt-BR')}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{stage.label}</p>
                <p className="text-[10px] text-muted-foreground/70">{stage.hint}</p>
              </div>
            </Fragment>
          )
        })}
        <div className="ml-2 pl-3 border-l border-border flex flex-col gap-3 justify-center shrink-0 pr-1">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">Taxa de Perda</p>
            <p className="text-xl font-extrabold tabular mt-1 leading-none" style={{ color: C.perda }}>{stats.taxa_perda ?? 0}%</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">Procurando agora</p>
            <p className="text-xl font-extrabold tabular mt-1 leading-none" style={{ color: C.ativo }}>{stats.ativos ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { pct: number } }[] }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-0.5">{name}</p>
      <p className="text-muted-foreground">{value.toLocaleString('pt-BR')} ({p.pct}%)</p>
    </div>
  )
}

function MotivosDonut({ data }: { data: Motivo[] }) {
  const total = data.reduce((s, d) => s + d.total, 0)
  const items = data.map((d, i) => ({ name: d.motivo, value: d.total, pct: Math.round(d.total * 100 / (total || 1)), color: DONUT[i % DONUT.length] }))
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
            <span className="font-bold tabular shrink-0" style={{ color: item.color }}>{item.value.toLocaleString('pt-BR')}</span>
            <span className="text-muted-foreground/60 shrink-0 w-8 text-right">{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FunilInquilinosClient() {
  const [regiao, setRegiao] = useState('Todos')
  const [tipo, setTipo] = useState('Todos')
  const [range, setRange] = useState('tudo')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (rg: string, tp: string, r: string) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ regiao: rg, tipo: tp, range: r })
      const res = await fetch(`/api/analitico/funil-inquilinos?${p}`, { cache: 'no-store' })
      setData(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(regiao, tipo, range) }, [regiao, tipo, range, load])

  const s = data?.stats
  const selectCls = 'h-8 px-2.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Funil de Inquilinos</h1>
          <p className="text-[13px] text-muted-foreground">Demanda de locação (Nido){loading && <span className="ml-2 opacity-50">carregando…</span>}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RANGE_OPTS.map(o => (
              <button key={o.value} onClick={() => setRange(o.value)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${range === o.value ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <select value={regiao} onChange={e => setRegiao(e.target.value)} className={selectCls}>
            {(data?.regioes ?? ['Todos']).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectCls}>
            {(data?.tipos ?? ['Todos']).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {s && <FunilVisual stats={s} />}

      <div className="grid gap-2.5" style={{ gridTemplateColumns: '11fr 13fr' }}>
        <PanelCard title="Canal de Origem">
          {data?.canal?.length ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.canal} margin={{ left: 4, right: 12, top: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="canal" tick={{ fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="total" name="Atendimentos" radius={[3, 3, 0, 0]}>
                  {data.canal.map((d, i) => <Cell key={i} fill={CANAL_CORES[d.canal] ?? '#6366f1'} />)}
                </Bar>
                <Bar dataKey="fechados" name="Fechados" fill={C.fechado} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
        <PanelCard title="Motivos de Não Fechamento">
          {data?.motivos?.length ? <MotivosDonut data={data.motivos} /> : <p className="text-xs text-muted-foreground py-6 text-center px-3">Sem dados</p>}
        </PanelCard>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: '14fr 10fr' }}>
        <PanelCard title="Demanda por Região">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.porRegiao ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="regiao" tick={{ fontSize: 9 }} tickLine={false} angle={-45} textAnchor="end" interval={0} height={64} tickFormatter={(v: string) => v && v.length > 12 ? v.slice(0, 11) + '…' : v} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="atendimentos" name="Atendimentos" fill={C.atend} radius={[2, 2, 0, 0]} />
              <Bar dataKey="com_proposta" name="Com proposta" fill={C.proposta} radius={[2, 2, 0, 0]} />
              <Bar dataKey="fechados" name="Fechados" fill={C.fechado} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
        <PanelCard title="Demanda por Tipo">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.porTipo ?? []} margin={{ left: 4, right: 12, top: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="tipo" tick={{ fontSize: 9 }} tickLine={false} angle={-45} textAnchor="end" interval={0} height={64} tickFormatter={(v: string) => v && v.length > 12 ? v.slice(0, 11) + '…' : v} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="atendimentos" name="Atendimentos" fill={C.atend} radius={[2, 2, 0, 0]} />
              <Bar dataKey="fechados" name="Fechados" fill={C.fechado} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>

      <PanelCard title="Evolução Mensal — Atendimentos, Fechados e Saídas da Adm">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={(data?.porMes ?? []).map(d => ({ ...d, mes: fmtMes(d.mes) }))} margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="mes" tick={{ fontSize: 9 }} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="linear" dataKey="atendimentos" name="Atendimentos" stroke={C.atend} strokeWidth={2} dot={{ r: 2, fill: C.atend, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Line type="linear" dataKey="fechados" name="Fechados" stroke={C.fechado} strokeWidth={2} dot={{ r: 2, fill: C.fechado, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Line type="linear" dataKey="saidas_adm" name="Saídas da Adm" stroke={C.saida} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2, fill: C.saida, strokeWidth: 0 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>
    </div>
  )
}
