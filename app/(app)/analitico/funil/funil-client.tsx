'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, LineChart, Line, CartesianGrid,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────
type Captacao = {
  card_id: number
  titulo: string | null
  fase_atual: string | null
  bairro: string | null
  tipo_imovel: string | null
  criado_em: string | null
  telefone_contato: string | null
  outros_contatos: string | null
  visita_agendada: string | null
  visita_entrada: string | null
  obs_visita: string | null
  motivo_nao_captacao: string | null
  valor_anuncio: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CAPTADOS_FASES = new Set(['Fechado Comercialmente', 'Captação Realizada ✅'])
const PERDIDOS_FASE = 'Não Captado ❌'
const CLOSED_POSITIVE = new Set([
  'Captação Realizada ✅', 'Fechado Comercialmente',
  'Matricula Solicitada', 'Ônus Solicitada', 'Locado / Retirado',
])

const C_FUNIL = ['#6366f1', '#8b5cf6', '#f59e0b', '#22c55e']
const C_PIE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16']

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(a: number, b: number, decimals = 1) {
  if (!b) return '—'
  return `${((a / b) * 100).toFixed(decimals)}%`
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function monthLabel(iso: string) {
  const [y, m] = iso.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card rounded-xl p-4 flex flex-col gap-1.5">
      <p className="eyebrow text-muted-foreground/60 text-[9px]">{label}</p>
      <p className="text-[26px] font-extrabold tabular leading-none" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  )
}

function InsightCard({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-[12px] font-medium leading-snug" style={{ background: bg, color }}>
      {text}
    </div>
  )
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card rounded-lg px-3 py-2 text-sm shadow-xl border border-border">
      {label && <p className="font-semibold text-foreground mb-1 text-xs">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: <span className="font-bold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function FunnelViz({ stages }: {
  stages: { label: string; value: number; color: string; conversion?: string }[]
}) {
  const max = stages[0]?.value || 1
  return (
    <div className="flex flex-col items-center gap-0 w-full">
      {stages.map((s, i) => {
        const widthPct = Math.max((s.value / max) * 100, 8)
        return (
          <div key={s.label} className="flex flex-col items-center w-full">
            {s.conversion && (
              <div className="flex items-center gap-2 my-1.5">
                <div className="w-px h-3" style={{ background: 'var(--border)' }} />
                <span className="text-[10px] text-muted-foreground font-mono tabular">
                  ↓ {s.conversion} de conversão
                </span>
                <div className="w-px h-3" style={{ background: 'var(--border)' }} />
              </div>
            )}
            <div
              className="relative flex items-center justify-between px-4 rounded-lg"
              style={{
                width: `${widthPct}%`,
                height: 52,
                background: s.color,
                minWidth: 180,
                transition: 'width 400ms cubic-bezier(0.4,0,0.2,1)',
                boxShadow: `0 2px 12px ${s.color}40`,
              }}
            >
              <span className="text-white text-sm font-semibold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                {s.label}
              </span>
              <span className="text-white text-xl font-black tabular" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                {s.value.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function FunilClient({ data }: { data: Captacao[] }) {
  const [mounted, setMounted] = useState(false)
  const [bairro, setBairro] = useState('Todos')
  const [tipo, setTipo] = useState('Todos')
  const [periodoStart, setPeriodoStart] = useState('')
  const [periodoEnd, setPeriodoEnd] = useState('')

  useEffect(() => setMounted(true), [])

  const bairros = useMemo(() =>
    ['Todos', ...Array.from(new Set(data.map(c => c.bairro).filter(Boolean) as string[])).sort()],
    [data]
  )

  const filtered = useMemo(() => data.filter(c => {
    if (bairro !== 'Todos' && c.bairro !== bairro) return false
    if (tipo !== 'Todos' && c.tipo_imovel !== tipo) return false
    if (periodoStart && c.criado_em && c.criado_em.slice(0, 7) < periodoStart) return false
    if (periodoEnd && c.criado_em && c.criado_em.slice(0, 7) > periodoEnd) return false
    return true
  }), [data, bairro, tipo, periodoStart, periodoEnd])

  // ── Métricas do funil ──
  const total = filtered.length
  const leads = filtered.filter(c => c.telefone_contato || c.outros_contatos).length
  const visitados = filtered.filter(c => c.visita_agendada || c.visita_entrada || c.obs_visita).length
  const captados = filtered.filter(c => CAPTADOS_FASES.has(c.fase_atual ?? '')).length
  const perdidos = filtered.filter(c => c.fase_atual === PERDIDOS_FASE).length
  const emAndamento = filtered.filter(c => c.fase_atual !== PERDIDOS_FASE && !CLOSED_POSITIVE.has(c.fase_atual ?? '')).length

  const avgTicket = (() => {
    const vals = filtered
      .filter(c => CAPTADOS_FASES.has(c.fase_atual ?? '') && c.valor_anuncio)
      .map(c => c.valor_anuncio!)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  })()

  const funnelStages = [
    { label: 'Oportunidades', value: total, color: C_FUNIL[0] },
    { label: 'Leads', value: leads, color: C_FUNIL[1], conversion: pct(leads, total) },
    { label: 'Visitados', value: visitados, color: C_FUNIL[2], conversion: pct(visitados, leads) },
    { label: 'Captados', value: captados, color: C_FUNIL[3], conversion: pct(captados, visitados) },
  ]

  // ── Insights dinâmicos ──
  const insights = useMemo(() => {
    const perdidosList = filtered.filter(c => c.fase_atual === PERDIDOS_FASE)
    const porTaxa = perdidosList.filter(c => c.motivo_nao_captacao?.toLowerCase().includes('taxa')).length
    const internoTRK = perdidosList.filter(c => c.motivo_nao_captacao === 'Captado por outro corretor da TRK').length
    const semMotivo = perdidosList.filter(c => !c.motivo_nao_captacao).length
    return { porTaxa, internoTRK, semMotivo, totalPerdidos: perdidosList.length }
  }, [filtered])

  // ── Motivos de perda ──
  const motivosData = useMemo(() => {
    const m: Record<string, number> = {}
    filtered.filter(c => c.fase_atual === PERDIDOS_FASE).forEach(c => {
      const key = c.motivo_nao_captacao ?? 'Sem registro'
      m[key] = (m[key] ?? 0) + 1
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  }, [filtered])

  // ── Distribuição por fase ──
  const faseData = useMemo(() => {
    const m: Record<string, number> = {}
    filtered.forEach(c => { const k = c.fase_atual ?? 'Sem fase'; m[k] = (m[k] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  }, [filtered])

  // ── Por bairro ──
  const bairroData = useMemo(() => {
    const m: Record<string, { total: number; captados: number; perdidos: number }> = {}
    filtered.forEach(c => {
      const k = c.bairro ?? 'Sem bairro'
      if (!m[k]) m[k] = { total: 0, captados: 0, perdidos: 0 }
      m[k].total++
      if (CAPTADOS_FASES.has(c.fase_atual ?? '')) m[k].captados++
      if (c.fase_atual === PERDIDOS_FASE) m[k].perdidos++
    })
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => ({ name, ...v }))
  }, [filtered])

  // ── Por tipo ──
  const tipoData = useMemo(() => {
    const m: Record<string, { total: number; captados: number; perdidos: number }> = {}
    filtered.forEach(c => {
      const k = c.tipo_imovel ?? 'N/D'
      if (!m[k]) m[k] = { total: 0, captados: 0, perdidos: 0 }
      m[k].total++
      if (CAPTADOS_FASES.has(c.fase_atual ?? '')) m[k].captados++
      if (c.fase_atual === PERDIDOS_FASE) m[k].perdidos++
    })
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total)
      .map(([name, v]) => ({ name, ...v }))
  }, [filtered])

  // ── Tendência mensal ──
  const trendData = useMemo(() => {
    const m: Record<string, number> = {}
    filtered.forEach(c => {
      if (!c.criado_em) return
      const month = c.criado_em.slice(0, 7)
      m[month] = (m[month] ?? 0) + 1
    })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month: monthLabel(month), count }))
  }, [filtered])

  const TIPOS = ['Todos', 'Casa', 'Apartamento', 'Comercial']

  return (
    <div className="p-6 flex flex-col gap-6 overflow-auto">
      {/* ── Header + Filtros ── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-0">
          <p className="eyebrow text-muted-foreground/50 mb-0.5">Analítico</p>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">Funil de Captação</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">De</label>
            <input type="month" value={periodoStart} onChange={e => setPeriodoStart(e.target.value)}
              className="bg-muted border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-foreground/40 transition-colors" />
            <label className="text-[11px] text-muted-foreground">até</label>
            <input type="month" value={periodoEnd} onChange={e => setPeriodoEnd(e.target.value)}
              className="bg-muted border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-foreground/40 transition-colors" />
          </div>
          <select value={bairro} onChange={e => setBairro(e.target.value)}
            className="bg-muted border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-foreground/40 transition-colors cursor-pointer">
            {bairros.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {TIPOS.map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  tipo === t ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}>
                {t}
              </button>
            ))}
          </div>
          {(bairro !== 'Todos' || tipo !== 'Todos' || periodoStart || periodoEnd) && (
            <button onClick={() => { setBairro('Todos'); setTipo('Todos'); setPeriodoStart(''); setPeriodoEnd('') }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline cursor-pointer">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Insights / Alertas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InsightCard
          text={`${pct(perdidos, total)} das oportunidades são perdidas (${perdidos} cards)`}
          color="var(--discard-fg)" bg="var(--discard-bg)"
        />
        {insights.porTaxa > 0 && (
          <InsightCard
            text={`${insights.porTaxa} perdas por objeção de taxa — revisar política de comissão`}
            color="#92400e" bg="color-mix(in srgb, #f59e0b 18%, var(--card))"
          />
        )}
        {insights.internoTRK > 0 && (
          <InsightCard
            text={`${insights.internoTRK} leads perdidos para outro corretor TRK — sobreposição de território`}
            color="#1e40af" bg="color-mix(in srgb, #3b82f6 15%, var(--card))"
          />
        )}
      </div>

      {/* ── Funil ── */}
      <div className="card rounded-xl p-6">
        <p className="eyebrow text-muted-foreground/60 mb-5 text-[9px]">Funil de Conversão — {total} oportunidades total</p>
        <FunnelViz stages={funnelStages} />
        <p className="text-center text-[11px] text-muted-foreground mt-5">
          Conversão total:{' '}
          <span className="font-bold" style={{ color: C_FUNIL[3] }}>{pct(captados, total)}</span>
          {' '}das oportunidades viram captações fechadas
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Taxa de Captação" value={pct(captados, total)} sub={`${captados} de ${total}`} color="#22c55e" />
        <KpiCard label="Taxa de Perda" value={pct(perdidos, total)} sub={`${perdidos} não captados`} color="#ef4444" />
        <KpiCard label="Em Andamento" value={String(emAndamento)} sub="ativos no pipeline" />
        <KpiCard
          label="Ticket Médio (captados)"
          value={avgTicket ? fmtBRL(avgTicket) : '—'}
          sub="valor de anúncio médio"
        />
      </div>

      {/* ── Motivos de perda + Fases ── */}
      {mounted && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Donut motivos */}
          <div className="card rounded-xl p-5">
            <p className="eyebrow text-muted-foreground/60 mb-4 text-[9px]">
              Motivos de Não Captação ({insights.totalPerdidos} perdidos
              {insights.semMotivo > 0 ? `, ${insights.semMotivo} sem registro` : ''})
            </p>
            {motivosData.length > 0 ? (
              <div className="flex gap-4 items-center">
                <PieChart width={148} height={148}>
                  <Pie data={motivosData} cx={70} cy={70} innerRadius={44} outerRadius={68} dataKey="value" paddingAngle={2}>
                    {motivosData.map((_, i) => <Cell key={i} fill={C_PIE[i % C_PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
                <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
                  {motivosData.map((m, i) => (
                    <div key={m.name} className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: C_PIE[i % C_PIE.length] }} />
                      <span className="text-[11px] text-foreground flex-1 truncate leading-tight">{m.name}</span>
                      <span className="text-[11px] font-bold tabular text-muted-foreground flex-shrink-0">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma perda no período selecionado.</p>
            )}
          </div>

          {/* Barras por fase */}
          <div className="card rounded-xl p-5">
            <p className="eyebrow text-muted-foreground/60 mb-4 text-[9px]">Distribuição por Fase Atual</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={faseData} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={148} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" name="Cards" radius={[0, 4, 4, 0]}>
                  {faseData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.name === PERDIDOS_FASE ? '#ef4444'
                      : CAPTADOS_FASES.has(entry.name) ? '#22c55e'
                      : CLOSED_POSITIVE.has(entry.name) ? '#06b6d4'
                      : '#6366f1'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Por bairro + Por tipo ── */}
      {mounted && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Por bairro */}
          <div className="card rounded-xl p-5">
            <p className="eyebrow text-muted-foreground/60 mb-4 text-[9px]">Por Bairro</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bairroData} margin={{ left: 4, right: 16, top: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="total" name="Oportunidades" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="captados" name="Captados" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Por tipo */}
          <div className="card rounded-xl p-5">
            <p className="eyebrow text-muted-foreground/60 mb-4 text-[9px]">Por Tipo de Imóvel</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={tipoData} margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="total" name="Oportunidades" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="captados" name="Captados" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Tendência mensal ── */}
      {mounted && trendData.length > 1 && (
        <div className="card rounded-xl p-5">
          <p className="eyebrow text-muted-foreground/60 mb-4 text-[9px]">Novas Oportunidades por Mês</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ left: 4, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="count" name="Oportunidades" stroke="#6366f1" strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#6366f1', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
