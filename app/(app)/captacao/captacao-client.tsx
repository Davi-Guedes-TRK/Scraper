'use client'

import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { SearchInput, Select } from '@/components/ui/toolbar'
import { fmtBRL } from '@/lib/formatters'

export type Target = {
  codigo_imovel: string
  proprietario: string | null
  telefone: string | null
  tipo_imovel: string | null
  bairro: string | null
  segmento: string | null
  endereco: string | null
  area_util: number | null
  pedido_atual: number | null
  comp_aluguel: number | null
  comp_n: number | null
  demanda_n: number | null
  orcamento_medio: number | null
  budget_gap: number | null
  dias_parado: number | null
  lat: number | null
  lng: number | null
  score: number | null
  rank_segmento: number | null
  synced_at: string | null
  captador: string | null
  win_back: boolean | null
  fac_aberto: boolean | null
  exclusivo: boolean | null
}

const ALL = '__all__'

// "(61) 99266-7753" -> "https://wa.me/5561992667753"
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
}

function mapsLink(t: Target): string | null {
  if (!t.lat && !t.lng && !t.endereco) return null
  if (t.lat && t.lng) return `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`
  const q = `${t.endereco ?? ''}, ${t.bairro ?? ''}, Brasília-DF`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function scoreColor(score: number | null): string {
  if (score == null) return '#897866'
  if (score >= 90) return '#5d7a43' // verde — quente
  if (score >= 70) return '#c08a3e' // âmbar — bom
  return '#897866'                  // neutro
}

export function CaptacaoClient({ targets }: { targets: Target[] }) {
  const [q, setQ] = useState('')
  const [bairro, setBairro] = useState(ALL)
  const [tipo, setTipo] = useState(ALL)
  const [soLimpo, setSoLimpo] = useState(false)
  const [soWinback, setSoWinback] = useState(false)

  const bairros = useMemo(
    () => Array.from(new Set(targets.map(t => t.bairro).filter(Boolean) as string[])).sort(),
    [targets],
  )
  const tipos = useMemo(
    () => Array.from(new Set(targets.map(t => t.tipo_imovel).filter(Boolean) as string[])).sort(),
    [targets],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return targets.filter(t => {
      if (bairro !== ALL && t.bairro !== bairro) return false
      if (tipo !== ALL && t.tipo_imovel !== tipo) return false
      if (soLimpo && (t.budget_gap ?? -1) < 0) return false
      if (soWinback && !t.win_back) return false
      if (needle) {
        const hay = `${t.proprietario ?? ''} ${t.endereco ?? ''} ${t.bairro ?? ''} ${t.telefone ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [targets, q, bairro, tipo, soLimpo, soWinback])

  const kpis = useMemo(() => {
    const segDemanda = new Map<string, number>()
    let limpo = 0
    let winback = 0
    let compSum = 0
    let compN = 0
    for (const t of filtered) {
      if (t.segmento && !segDemanda.has(t.segmento)) segDemanda.set(t.segmento, t.demanda_n ?? 0)
      if ((t.budget_gap ?? -1) >= 0) limpo++
      if (t.win_back) winback++
      if (t.comp_aluguel) { compSum += t.comp_aluguel; compN++ }
    }
    return {
      alvos: filtered.length,
      esperando: Array.from(segDemanda.values()).reduce((s, n) => s + n, 0),
      limpo,
      winback,
      compMedio: compN ? Math.round(compSum / compN) : 0,
    }
  }, [filtered])

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Demand-pull · dw_trk"
        title="Alvos de Captação"
        subtitle="Imóveis fora do mercado com locatário esperando e comp real — ordenados por probabilidade de fechar."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">
        <StatTile label="Alvos na lista" value={kpis.alvos} accent="#6e4d34" sublabel="proprietários com telefone" />
        <StatTile label="Locatários esperando" value={kpis.esperando} accent="#5d7a43" sublabel="demanda nos segmentos" />
        <StatTile label="Match limpo" value={kpis.limpo} accent="#0ea5e9" sublabel="orçamento ≥ aluguel real" />
        <StatTile label="Win-back" value={kpis.winback} accent="#8b5cf6" sublabel="ex-captação de concorrente" />
        <StatTile label="Comp médio" value={kpis.compMedio} accent="#c08a3e" sublabel="aluguel realmente fechado" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="w-60">
          <SearchInput value={q} onChange={setQ} placeholder="Proprietário, endereço, telefone…" />
        </div>
        <Select
          value={bairro}
          onChange={setBairro}
          options={[{ value: ALL, label: 'Todos os bairros' }, ...bairros.map(b => ({ value: b, label: b }))]}
        />
        <Select
          value={tipo}
          onChange={setTipo}
          options={[{ value: ALL, label: 'Todos os tipos' }, ...tipos.map(tp => ({ value: tp, label: tp }))]}
        />
        <button
          onClick={() => setSoLimpo(v => !v)}
          className={`h-8 px-3 text-sm rounded-lg border cursor-pointer transition-colors ${soLimpo ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
          style={{ borderColor: 'var(--border)', background: soLimpo ? 'var(--accent)' : 'var(--background)' }}
        >
          Só match limpo
        </button>
        <button
          onClick={() => setSoWinback(v => !v)}
          className={`h-8 px-3 text-sm rounded-lg border cursor-pointer transition-colors ${soWinback ? 'font-semibold' : 'text-muted-foreground'}`}
          style={{
            borderColor: soWinback ? '#8b5cf6' : 'var(--border)',
            background: soWinback ? '#ede9fe' : 'var(--background)',
            color: soWinback ? '#6d28d9' : undefined,
          }}
        >
          Só win-back
        </button>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {filtered.length} de {targets.length}
        </span>
      </div>

      {/* Tabela */}
      <div className="card rounded-lg overflow-hidden">
        <div
          className="grid grid-cols-[auto_1.4fr_1.4fr_auto_auto_auto] gap-3 px-4 py-2 text-[10px] eyebrow text-muted-foreground"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span>Score</span>
          <span>Proprietário</span>
          <span>Imóvel</span>
          <span className="text-right">Comp real</span>
          <span className="text-right">Buscando</span>
          <span className="text-right">Ação</span>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum alvo com esses filtros.</p>
        ) : (
          filtered.map(t => <Row key={t.codigo_imovel} t={t} />)
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        <strong className="text-foreground">Score</strong> combina demanda do segmento, liquidez do comp, frescor do lead e se o orçamento do locatário cobre o aluguel real.
        {' '}<strong className="text-foreground">Comp real</strong> = média do que efetivamente fechou de locação (últimos 24 meses), não preço de anúncio.
        {' '}<strong style={{ color: '#6d28d9' }}>Win-back</strong> = imóvel que um concorrente (Lopes) já captou e largou — o dono já teve corretor, mas o contato pode estar desatualizado.
      </p>
    </div>
  )
}

function Row({ t }: { t: Target }) {
  const wa = waLink(t.telefone)
  const maps = mapsLink(t)
  const gap = t.budget_gap

  return (
    <div
      className="grid grid-cols-[auto_1.4fr_1.4fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-accent/40 transition-colors"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Score */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-[13px] font-extrabold font-display tabular"
        style={{ background: scoreColor(t.score) }}
      >
        {t.score != null ? Math.round(t.score) : '—'}
      </div>

      {/* Proprietário */}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">{t.proprietario ?? '—'}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{t.telefone ?? 'sem telefone'}</p>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          {t.dias_parado != null && (
            <span className="text-[10px] text-muted-foreground">fora do mercado há {t.dias_parado} d</span>
          )}
          {t.win_back && (
            <span
              className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: '#ede9fe', color: '#6d28d9' }}
              title="Ex-captação de concorrente — o dono já teve corretor"
            >
              Win-back {t.captador}{t.fac_aberto ? ' · FAC aberto' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Imóvel */}
      <div className="min-w-0">
        <p className="text-[13px] text-foreground truncate">
          {t.tipo_imovel} · {t.bairro}
        </p>
        <p className="text-[11px] text-muted-foreground truncate font-mono">
          {t.endereco}{t.area_util ? ` · ${Math.round(t.area_util)} m²` : ''}
        </p>
      </div>

      {/* Comp real + gap */}
      <div className="text-right">
        <p className="text-[13px] font-bold font-mono text-foreground tabular">{fmtBRL(t.comp_aluguel ?? 0)}</p>
        {gap != null && (
          <p
            className="text-[10px] font-bold font-mono"
            style={{ color: gap >= 0 ? '#5d7a43' : '#b4452f' }}
            title="Orçamento médio de quem procura vs aluguel que fecha de verdade"
          >
            {gap >= 0 ? '+' : '−'}{fmtBRL(Math.abs(gap))}
          </p>
        )}
      </div>

      {/* Buscando */}
      <div className="text-right">
        <span
          className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full inline-block"
          style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
          title="Locatários que procuraram esse segmento nos últimos 12 meses"
        >
          {t.demanda_n ?? 0}
        </span>
      </div>

      {/* Ação */}
      <div className="flex items-center gap-1.5 justify-end">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            title="Chamar no WhatsApp"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-85"
            style={{ background: '#5d7a43' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.15L3 21l1.85-6.4A8 8 0 1121 12z" />
            </svg>
          </a>
        )}
        {maps && (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            title="Ver no mapa"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ border: '1px solid var(--border)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}
