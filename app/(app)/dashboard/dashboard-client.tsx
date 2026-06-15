'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { StatTile } from '@/components/ui/stat-tile'
import { parsePreco, fmtBRL } from '@/lib/formatters'
import type { Papel } from '@/lib/supabase/profile'

const DashboardChart = dynamic(
  () => import('./dashboard-chart').then(m => m.DashboardChart),
  { ssr: false, loading: () => <div className="h-[180px] rounded-lg animate-pulse" style={{ background: 'var(--secondary)' }} /> }
)

const STAGES = [
  { key: 'pendentes',   label: 'Triagem',     sub: 'Aguardando revisão',  accent: '#6366f1', href: '/triagem' },
  { key: 'paraVisitar', label: 'Para visitar', sub: 'Sem visita',          accent: '#0ea5e9', href: '/visitas' },
  { key: 'visitados',   label: 'Visitados',    sub: 'Visita concluída',    accent: '#f59e0b', href: '/relatorio' },
  { key: 'aprovados',   label: 'Aprovados',    sub: 'Captação confirmada', accent: '#22c55e', href: '/relatorio' },
  { key: 'solicitados', label: 'No cartório',  sub: 'Matrícula pedida',    accent: '#8b5cf6', href: '/relatorio' },
  { key: 'recebidos',   label: 'Recebidos',    sub: 'Documentação OK',     accent: '#64748b', href: '/relatorio' },
]

const PORTAL_COLORS: Record<string, string> = {
  olx:       '#003BBB',
  dfimoveis: '#c08a3e',
  wimoveis:  '#5d7a43',
  facebook:  '#4267B2',
}

type FilaItem = {
  link: string; titulo?: string | null; bairro?: string | null; cidade?: string | null
  preco?: string | null; portal: string; coletado_em?: string | null
  anunciante: 'proprietario' | 'corretor' | 'indefinido'
}
type Alert = {
  portal: string; link: string; titulo?: string; bairro?: string; cidade?: string; preco?: string
}

function regiao(bairro?: string | null, cidade?: string | null) {
  return [bairro, cidade?.replace(/-/g, ' ')].filter(Boolean).join(' · ') || '—'
}

function PropertyRow({ item }: { item: FilaItem }) {
  const initial = (item.titulo || item.bairro || '?')[0].toUpperCase()
  const avatarColor = PORTAL_COLORS[item.portal] ?? '#897866'

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer group"
    >
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold font-display"
        style={{ background: avatarColor }}
      >
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {item.titulo || '(sem título)'}
        </p>
        <p className="text-[11px] text-muted-foreground truncate font-mono mb-1.5">
          {regiao(item.bairro, item.cidade)}
        </p>
        <div className="flex flex-wrap gap-1">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            {item.portal}
          </span>
          {item.anunciante === 'proprietario' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#B5E2C7', color: '#1a5c32' }}>
              Proprietário
            </span>
          )}
          {item.anunciante === 'corretor' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#ece3d4', color: '#6e4d34' }}>
              Corretor
            </span>
          )}
        </div>
      </div>

      {item.preco && parsePreco(item.preco) > 0 && (
        <span className="text-[11px] font-bold font-mono text-foreground flex-shrink-0 mt-0.5">
          {fmtBRL(parsePreco(item.preco))}
        </span>
      )}
    </a>
  )
}

// ── Hero "Próxima ação" para Captador ─────────────────────────────────────────
function NextActionHero({ funnelCounts }: { funnelCounts: Record<string, number> }) {
  const pendentes   = funnelCounts.pendentes   ?? 0
  const paraVisitar = funnelCounts.paraVisitar ?? 0

  if (pendentes > 0) {
    return (
      <div
        className="rounded-xl p-5 flex flex-col gap-3"
        style={{ background: 'color-mix(in srgb, var(--chart-1) 10%, var(--background))', border: '1px solid color-mix(in srgb, var(--chart-1) 25%, transparent)' }}
      >
        <div>
          <p className="eyebrow" style={{ color: 'var(--chart-1)' }}>Próxima ação</p>
          <p className="text-2xl font-extrabold font-display text-foreground mt-0.5">
            {pendentes} imóve{pendentes === 1 ? 'l' : 'is'} aguardando triagem
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Revise os anúncios novos e decida se vai visitar ou descartar.
          </p>
        </div>
        <Link
          href="/triagem"
          className="inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80 cursor-pointer"
          style={{ background: 'var(--chart-1)', color: '#fff' }}
        >
          Ir para a Triagem
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    )
  }

  if (paraVisitar > 0) {
    return (
      <div
        className="rounded-xl p-5 flex flex-col gap-3"
        style={{ background: 'color-mix(in srgb, #0ea5e9 10%, var(--background))', border: '1px solid color-mix(in srgb, #0ea5e9 25%, transparent)' }}
      >
        <div>
          <p className="eyebrow" style={{ color: '#0ea5e9' }}>Próxima ação</p>
          <p className="text-2xl font-extrabold font-display text-foreground mt-0.5">
            {paraVisitar} imóve{paraVisitar === 1 ? 'l' : 'is'} para visitar
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Planeje sua rota e registre as visitas no campo.
          </p>
        </div>
        <Link
          href="/visitas"
          className="inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 cursor-pointer"
          style={{ background: '#0ea5e9' }}
        >
          Ver rota de visitas
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-5 flex items-center gap-4"
      style={{ background: 'color-mix(in srgb, var(--success) 10%, var(--background))', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' }}
    >
      <svg className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p className="font-bold text-foreground">Tudo em dia!</p>
        <p className="text-sm text-muted-foreground">Nenhum imóvel aguardando ação. Aguarde novos anúncios.</p>
      </div>
    </div>
  )
}

// ── Cartório Hero para Operador ───────────────────────────────────────────────
function CartorioHero({ funnelCounts }: { funnelCounts: Record<string, number> }) {
  const visitados   = funnelCounts.visitados   ?? 0
  const aprovados   = funnelCounts.aprovados   ?? 0
  const solicitados = funnelCounts.solicitados ?? 0
  const recebidos   = funnelCounts.recebidos   ?? 0
  const pendingAction = aprovados + visitados

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: 'color-mix(in srgb, #8b5cf6 10%, var(--background))', border: '1px solid color-mix(in srgb, #8b5cf6 25%, transparent)' }}
    >
      <div>
        <p className="eyebrow" style={{ color: '#8b5cf6' }}>Cartório · Próxima ação</p>
        {pendingAction > 0 ? (
          <>
            <p className="text-2xl font-extrabold font-display text-foreground mt-0.5">
              {pendingAction} imóve{pendingAction === 1 ? 'l' : 'is'} aguardando processamento
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {visitados > 0 && `${visitados} com visita, sem aprovação. `}
              {aprovados > 0 && `${aprovados} aprovados aguardando matrícula.`}
            </p>
          </>
        ) : solicitados > 0 ? (
          <>
            <p className="text-2xl font-extrabold font-display text-foreground mt-0.5">
              {solicitados} matrícula{solicitados === 1 ? '' : 's'} solicitada{solicitados === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Aguardando retorno do cartório.</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-extrabold font-display text-foreground mt-0.5">Fila limpa</p>
            <p className="text-sm text-muted-foreground mt-1">{recebidos} doc{recebidos === 1 ? 'umento' : 'umentos'} recebido{recebidos === 1 ? '' : 's'} esta semana.</p>
          </>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Link
          href="/relatorio"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-80 cursor-pointer"
          style={{ background: '#8b5cf6' }}
        >
          Abrir Cartório
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        {aprovados > 0 && (
          <Link href="/relatorio" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-accent cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            Ver aprovados ({aprovados})
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
export function DashboardClient({
  papel, funnelCounts, alertas, chartData, fila, coletados7d, coletaDelta,
}: {
  papel: Papel
  funnelCounts: Record<string, number>
  alertas: Alert[]
  chartData: { dia: string }[]
  fila: FilaItem[]
  coletados7d: number
  coletaDelta: number | null
}) {
  const total = Math.max(1, STAGES.reduce((s, st) => s + (funnelCounts[st.key] ?? 0), 0))

  // ── Captador ──────────────────────────────────────────────────────────────
  if (papel === 'captador') {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-xl mx-auto w-full">
        <div>
          <p className="eyebrow text-muted-foreground">Bom dia, captador</p>
          <h2 className="text-lg font-bold text-foreground font-display">Painel de Campo</h2>
        </div>

        <NextActionHero funnelCounts={funnelCounts} />

        {/* KPIs simplificados */}
        <div className="grid grid-cols-2 gap-2.5">
          {STAGES.slice(0, 4).map(st => (
            <StatTile
              key={st.key}
              label={st.label}
              value={funnelCounts[st.key] ?? 0}
              sublabel={st.sub}
              accent={st.accent}
              href={st.href}
              share={((funnelCounts[st.key] ?? 0) / total) * 100}
            />
          ))}
        </div>

        {/* Fila rápida */}
        {fila.length > 0 && (
          <div className="card rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold text-foreground">Próximos na fila</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {fila.slice(0, 5).map(item => <PropertyRow key={`${item.portal}-${item.link}`} item={item} />)}
            </div>
            <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <Link href="/triagem" className="text-xs font-semibold cursor-pointer hover:underline" style={{ color: 'var(--chart-1)' }}>
                Ver todos na triagem →
              </Link>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Operador ──────────────────────────────────────────────────────────────
  if (papel === 'operador') {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        <div>
          <p className="eyebrow text-muted-foreground">Operações</p>
          <h2 className="text-lg font-bold text-foreground font-display">Painel do Operador</h2>
        </div>

        <CartorioHero funnelCounts={funnelCounts} />

        {/* KPIs cartório */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STAGES.slice(2).map(st => (
            <StatTile
              key={st.key}
              label={st.label}
              value={funnelCounts[st.key] ?? 0}
              sublabel={st.sub}
              accent={st.accent}
              href={st.href}
              share={((funnelCounts[st.key] ?? 0) / total) * 100}
            />
          ))}
        </div>

        {/* Gráfico (resumido) */}
        <div className="card rounded-lg p-3">
          <h3 className="font-semibold text-foreground text-xs mb-2">Coleta — últimos 7 dias</h3>
          <DashboardChart data={chartData} />
        </div>
      </div>
    )
  }

  // ── Gestor / Admin — visão completa ───────────────────────────────────────
  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>

      <main className="flex-1 overflow-y-auto min-w-0 p-4" style={{ background: 'var(--background)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="eyebrow text-muted-foreground mb-0.5">Painel de Captação</p>
            <h2 className="text-sm font-bold text-foreground font-display tracking-tight">
              Operação Velvet · Lago Sul
            </h2>
          </div>
          <Link
            href="/triagem"
            className="btn-primary h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
          >
            Triagem
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {STAGES.map(st => (
            <StatTile
              key={st.key}
              label={st.label}
              value={funnelCounts[st.key] ?? 0}
              sublabel={st.sub}
              accent={st.accent}
              href={st.href}
              share={((funnelCounts[st.key] ?? 0) / total) * 100}
            />
          ))}
        </div>

        <div className="card rounded-lg p-3 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-foreground text-xs">Coleta — últimos 7 dias</h3>
              <p className="eyebrow text-muted-foreground">Por portal</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold font-display tabular text-foreground leading-none">
                {coletados7d}
              </p>
              {coletaDelta !== null && (
                <p
                  className="text-[10px] font-bold font-mono mt-0.5"
                  style={{ color: coletaDelta >= 0 ? 'var(--success)' : 'var(--destructive)' }}
                >
                  {coletaDelta >= 0 ? '↑' : '↓'}{Math.abs(coletaDelta)}% vs 7d ant.
                </p>
              )}
            </div>
          </div>
          <DashboardChart data={chartData} />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 rounded-lg px-3 py-2.5 flex items-center justify-between"
               style={{ background: 'color-mix(in srgb, var(--destructive) 12%, var(--background))' }}>
            <span className="text-xs font-medium text-muted-foreground">Pendentes</span>
            <span className="text-sm font-extrabold font-display tabular text-foreground">
              {funnelCounts.pendentes ?? 0}
            </span>
          </div>
          <div className="flex-1 rounded-lg px-3 py-2.5 flex items-center justify-between"
               style={{ background: 'color-mix(in srgb, var(--success) 12%, var(--background))' }}>
            <span className="text-xs font-medium text-muted-foreground">Aprovados</span>
            <span className="text-sm font-extrabold font-display tabular text-foreground">
              {funnelCounts.aprovados ?? 0}
            </span>
          </div>
        </div>

        {/* Fila de triagem (gestores também veem) */}
        {fila.length > 0 && (
          <div className="card rounded-lg overflow-hidden mt-3">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold text-foreground">Últimos na fila</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {fila.map(item => <PropertyRow key={`${item.portal}-${item.link}`} item={item} />)}
            </div>
          </div>
        )}
      </main>

      <aside
        className="w-64 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'var(--sidebar)', borderLeft: '1px solid var(--sidebar-border)' }}
      >
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <p className="text-[32px] font-extrabold font-display tabular text-foreground leading-none">
            {coletados7d}
          </p>
          <p className="eyebrow text-muted-foreground mt-1">Coletados · 7 dias</p>
          {coletaDelta !== null && (
            <p
              className="text-[11px] font-bold font-mono mt-1.5"
              style={{ color: coletaDelta >= 0 ? 'var(--success)' : 'var(--destructive)' }}
            >
              {coletaDelta >= 0 ? '↑' : '↓'}{Math.abs(coletaDelta)}% vs semana ant.
            </p>
          )}
        </div>

        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <p className="eyebrow text-muted-foreground mb-2">Funil</p>
          <div className="flex flex-col gap-1.5">
            {STAGES.map(st => {
              const val = funnelCounts[st.key] ?? 0
              const pct = Math.round((val / total) * 100)
              return (
                <div key={st.key} className="flex items-center gap-2">
                  <span className="w-[60px] text-[10px] text-muted-foreground truncate">{st.label}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ background: st.accent, width: `${Math.max(2, pct)}%` }} />
                  </div>
                  <span className="w-5 text-right text-[10px] font-mono font-bold text-foreground tabular">{val}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className="px-4 py-2 flex-shrink-0 flex items-center gap-2"
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: 'var(--success)', animation: 'pulse-dot 2.2s ease-in-out infinite' }}
          />
          <p className="eyebrow text-muted-foreground">Captados hoje</p>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">{alertas.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {alertas.length > 0 ? (
            alertas.slice(0, 20).map(item => (
              <a
                key={`${item.portal}-${item.link}`}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/60 transition-colors group"
                style={{ borderBottom: '1px solid var(--sidebar-border)' }}
              >
                <div
                  className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                >
                  {(item.titulo || item.bairro || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                    {item.titulo || '(sem título)'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate font-mono">
                    {regiao(item.bairro, item.cidade)}
                  </p>
                </div>
              </a>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              Nenhum proprietário captado hoje.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
