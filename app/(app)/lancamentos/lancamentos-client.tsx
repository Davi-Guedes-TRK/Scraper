'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { LANCAMENTO_FONTES } from '@/lib/portals'
import { fmtBRL, timeAgo } from '@/lib/formatters'

const BAIRROS_TRK = [
  'Lago Sul', 'Lago Norte', 'Asa Sul', 'Asa Norte',
  'Noroeste', 'Sudoeste', 'Park Way', 'Park Sul',
]

const STATUS_LABELS: Record<string, string> = {
  lancamento: 'Lançamento',
  breve_lancamento: 'Breve lançamento',
  em_obras: 'Em obras',
  pronto: 'Pronto pra morar',
}

type Empreendimento = {
  fonte: string
  slug: string
  nome: string | null
  url: string | null
  tipo: string | null
  status: string | null
  pct_obras: number | null
  bairro: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  area_min_m2: number | null
  area_max_m2: number | null
  total_unidades: number | null
  suites_max: number | null
  vagas_min: number | null
  vagas_max: number | null
  preco_min: number | null
  preco_max: number | null
  tipologias: unknown
  diferenciais: string[] | null
  descricao: string | null
  scraped_at: string | null
}

type FonteStats = { fonte: string; total: number; ultimo: string | null }
type ApiResponse = { items: Empreendimento[]; stats: FonteStats[] }

type SortCol = 'nome' | 'bairro' | 'area_min_m2' | 'preco_min' | 'pct_obras' | 'total_unidades' | 'scraped_at'
type SortDir = 'asc' | 'desc'

// Extrai bairro: usa campo bairro ou tenta casar a partir do endereço/cidade
function getBairro(item: Empreendimento): string | null {
  if (item.bairro?.trim()) return item.bairro.trim()
  // Tenta achar um bairro TRK no endereço ou cidade
  const haystack = `${item.endereco ?? ''} ${item.cidade ?? ''}`.toLowerCase()
  for (const b of BAIRROS_TRK) {
    if (haystack.includes(b.toLowerCase())) return b
  }
  // Usa cidade como último recurso
  return item.cidade?.trim() || null
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const label = STATUS_LABELS[status] ?? status
  const palette: Record<string, { bg: string; fg: string }> = {
    lancamento:       { bg: '#FCE7BF', fg: '#7A4F12' },
    breve_lancamento: { bg: '#E6E2F5', fg: '#3B2F66' },
    em_obras:         { bg: '#FFDDB7', fg: '#9A4A0E' },
    pronto:           { bg: '#C7E9CB', fg: '#1F5C2A' },
  }
  const c = palette[status] ?? { bg: 'var(--secondary)', fg: 'var(--muted-foreground)' }
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  )
}

function FonteBadge({ fonte }: { fonte: string }) {
  const def = LANCAMENTO_FONTES[fonte]
  if (!def) return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border whitespace-nowrap"
      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
      {fonte}
    </span>
  )
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ background: `${def.hex}22`, color: def.hex }}
    >
      {def.label}
    </span>
  )
}

function MiniProgress({ item }: { item: Pick<Empreendimento, 'pct_obras' | 'status'> }) {
  let pct: number | null = null
  let label = '—'

  if (item.pct_obras !== null && item.pct_obras !== undefined) {
    pct = Math.round(Number(item.pct_obras))
    label = `${pct}%`
  } else {
    switch (item.status) {
      case 'pronto':           pct = 100; label = '100%'; break
      case 'lancamento':       pct = 0;   label = '0%';   break
      case 'breve_lancamento': pct = 0;   label = '0%';   break
      case 'em_obras':         pct = null; label = '···'; break
    }
  }

  const barColor = pct === 100 ? '#22c55e' : pct === 0 ? 'var(--border)' : 'var(--primary)'

  return (
    <div className="flex items-center gap-2">
      {pct !== null ? (
        <div className="w-14 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--secondary)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      ) : (
        <div className="w-14 h-1.5 rounded-full flex-shrink-0" style={{
          background: 'repeating-linear-gradient(45deg, var(--secondary), var(--secondary) 3px, transparent 3px, transparent 6px)',
          border: '1px solid var(--border)',
        }} />
      )}
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
    </div>
  )
}

function SortIcon({ col, active, dir }: { col: SortCol; active: SortCol; dir: SortDir }) {
  if (col !== active) return <span className="text-muted-foreground/40 ml-1 select-none">↕</span>
  return <span className="text-primary ml-1 select-none">{dir === 'asc' ? '↑' : '↓'}</span>
}

function sortItems(items: Empreendimento[], col: SortCol, dir: SortDir): Empreendimento[] {
  return [...items].sort((a, b) => {
    let va: string | number | null
    let vb: string | number | null

    if (col === 'nome') {
      va = a.nome ?? a.slug
      vb = b.nome ?? b.slug
    } else if (col === 'scraped_at') {
      va = a.scraped_at ? new Date(a.scraped_at).getTime() : null
      vb = b.scraped_at ? new Date(b.scraped_at).getTime() : null
    } else {
      va = a[col]
      vb = b[col]
    }

    if (va === null || va === undefined) return 1
    if (vb === null || vb === undefined) return -1

    let cmp: number
    if (typeof va === 'string' && typeof vb === 'string') {
      cmp = va.localeCompare(vb, 'pt-BR')
    } else {
      cmp = (va as number) < (vb as number) ? -1 : (va as number) > (vb as number) ? 1 : 0
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

type Tipologia = { quartos: number; area_min: number; area_max?: number | null }

function TipologiasRow({ tipologias, colSpan }: { tipologias: unknown; colSpan: number }) {
  const list = (Array.isArray(tipologias) ? tipologias : []) as Tipologia[]
  if (!list.length) return null
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pb-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          {list.map((t, i) => (
            <span key={i}
              className="text-[10px] px-2 py-0.5 rounded-full font-mono border"
              style={{ background: 'var(--secondary)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              {t.quartos}q · {t.area_min}{t.area_max && t.area_max !== t.area_min ? `–${t.area_max}` : ''} m²
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

export function LancamentosClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fonte, setFonte] = useState<string | null>(() => searchParams.get('fonte'))
  const [bairro, setBairro] = useState<string | null>(() => searchParams.get('bairro'))
  const [status, setStatus] = useState<string | null>(() => searchParams.get('status'))
  const [sortCol, setSortCol] = useState<SortCol>('scraped_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [reloadKey, setReloadKey] = useState(0)

  const syncUrl = useCallback((f: string | null, b: string | null, s: string | null) => {
    const p = new URLSearchParams()
    if (f) p.set('fonte', f)
    if (b) p.set('bairro', b)
    if (s) p.set('status', s)
    router.replace(`?${p.toString()}`, { scroll: false })
  }, [router])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true); setErro(null)
    syncUrl(fonte, bairro, status)
    const params = new URLSearchParams()
    if (fonte) params.set('fonte', fonte)
    if (bairro) params.set('bairro', bairro)
    if (status) params.set('status', status)
    fetch(`/api/empreendimentos?${params}`, { signal: ac.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setErro(e.message ?? 'Erro ao carregar') })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [fonte, bairro, status, syncUrl, reloadKey])

  const itemsByBairro = useMemo(() => {
    if (!data) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const it of data.items) {
      const k = getBairro(it) || '(sem bairro)'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [data])

  const sorted = useMemo(() => {
    if (!data?.items) return []
    return sortItems(data.items, sortCol, sortDir)
  }, [data, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const pillBase = 'text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 cursor-pointer'
  const pillActive = 'border-primary bg-primary/10 text-primary'
  const pillIdle = 'text-muted-foreground hover:text-foreground'

  const thBase = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap select-none border-b border-border/60'
  const thSort = `${thBase} cursor-pointer hover:text-foreground transition-colors`

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Lançamentos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Empreendimentos captados de construtoras DF — Lotus, Paulo Octávio, Riva, Direcional, GreenHouse, Elar.
        </p>
      </div>

      {/* Stats por fonte */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(LANCAMENTO_FONTES).map(([key, def]) => {
          const s = data?.stats.find(x => x.fonte === key)
          const isActive = fonte === key
          return (
            <button
              key={key}
              onClick={() => setFonte(isActive ? null : key)}
              className={`card rounded-lg p-3 text-left transition-all ${isActive ? 'ring-2' : 'hover:bg-accent/40'}`}
              style={isActive ? { borderColor: def.hex, '--tw-ring-color': def.hex } as React.CSSProperties : {}}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ background: def.hex }} />
                <span className="eyebrow text-[10px]">{def.label}</span>
              </div>
              <div className="font-display text-2xl font-bold tabular text-foreground">{s?.total ?? 0}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-1">
                {s?.ultimo ? timeAgo(s.ultimo) : 'sem dados'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-muted-foreground">Bairro:</span>
          <button onClick={() => setBairro(null)}
            className={`${pillBase} ${!bairro ? pillActive : pillIdle}`}
            style={!bairro ? {} : { borderColor: 'var(--border)' }}>
            Todos
          </button>
          {BAIRROS_TRK.map(b => {
            const isActive = bairro === b
            const count = itemsByBairro.get(b) ?? 0
            return (
              <button key={b} onClick={() => setBairro(isActive ? null : b)}
                className={`${pillBase} ${isActive ? pillActive : pillIdle}`}
                style={isActive ? {} : { borderColor: 'var(--border)' }}>
                {b}
                {count > 0 && <span className="ml-1.5 text-muted-foreground/70 font-mono">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-muted-foreground">Status:</span>
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const isActive = status === key
            return (
              <button key={key} onClick={() => setStatus(isActive ? null : key)}
                className={`${pillBase} ${isActive ? pillActive : pillIdle}`}
                style={isActive ? {} : { borderColor: 'var(--border)' }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm px-4 py-3 flex items-center justify-between gap-3">
          <span>{erro}</span>
          <button onClick={() => setReloadKey(k => k + 1)} className="text-xs font-medium underline hover:no-underline cursor-pointer shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="card rounded-lg overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse border-b border-border/40 last:border-0"
              style={{ background: i % 2 === 0 ? 'var(--secondary)' : 'transparent' }} />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="card rounded-lg p-12 text-center text-muted-foreground text-sm">
          Nenhum empreendimento encontrado com esses filtros.
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground font-mono">
            {data.items.length} resultado{data.items.length !== 1 ? 's' : ''}
          </div>

          <div className="card rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--secondary)' }}>
                  <th className={thSort} onClick={() => handleSort('nome')}>
                    Empreendimento <SortIcon col="nome" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thBase}>Status</th>
                  <th className={thSort} onClick={() => handleSort('bairro')}>
                    Bairro <SortIcon col="bairro" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thSort} onClick={() => handleSort('area_min_m2')}>
                    Área <SortIcon col="area_min_m2" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thSort} onClick={() => handleSort('total_unidades')}>
                    Unid. <SortIcon col="total_unidades" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thBase}>Suítes</th>
                  <th className={thBase}>Vagas</th>
                  <th className={thSort} onClick={() => handleSort('preco_min')}>
                    Preço <SortIcon col="preco_min" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thSort} onClick={() => handleSort('pct_obras')}>
                    Obra <SortIcon col="pct_obras" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thSort} onClick={() => handleSort('scraped_at')}>
                    Captado <SortIcon col="scraped_at" active={sortCol} dir={sortDir} />
                  </th>
                  <th className={thBase} style={{ width: '32px' }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, idx) => {
                  const rowKey = `${item.fonte}-${item.slug}`
                  const isExpanded = expandedRows.has(rowKey)
                  const hasTipologias = Array.isArray(item.tipologias) && (item.tipologias as unknown[]).length > 0

                  const area = item.area_min_m2 && item.area_max_m2 && item.area_min_m2 !== item.area_max_m2
                    ? `${item.area_min_m2}–${item.area_max_m2} m²`
                    : item.area_min_m2 ? `${item.area_min_m2} m²` : '—'

                  const preco = item.preco_min && item.preco_max && item.preco_min !== item.preco_max
                    ? `${fmtBRL(item.preco_min)} – ${fmtBRL(item.preco_max)}`
                    : item.preco_min ? fmtBRL(item.preco_min) : '—'

                  const vagas = item.vagas_min !== null && item.vagas_max !== null && item.vagas_min !== item.vagas_max
                    ? `${item.vagas_min}–${item.vagas_max}`
                    : item.vagas_min ?? item.vagas_max ?? '—'

                  const rowBg = idx % 2 === 1 ? 'color-mix(in srgb, var(--secondary) 30%, transparent)' : 'transparent'

                  return (
                    <>
                      <tr
                        key={rowKey}
                        onClick={() => item.url && window.open(item.url, '_blank')}
                        className="border-b border-border/40 transition-colors"
                        style={{ background: rowBg, cursor: item.url ? 'pointer' : 'default' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? 'var(--accent)/40' : rowBg)}
                      >
                        <td className="px-3 py-3 min-w-[200px]">
                          <div className="font-medium text-foreground text-[13px] leading-tight mb-1">
                            {item.nome ?? item.slug}
                          </div>
                          <FonteBadge fonte={item.fonte} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-3 py-3 text-[12px] text-muted-foreground font-mono whitespace-nowrap">
                          {getBairro(item) ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono whitespace-nowrap text-foreground">
                          {area}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono text-center text-foreground">
                          {item.total_unidades ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono text-center text-foreground">
                          {item.suites_max ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono text-center text-foreground">
                          {vagas}
                        </td>
                        <td className="px-3 py-3 text-[12px] font-mono whitespace-nowrap text-foreground">
                          {preco}
                        </td>
                        <td className="px-3 py-3">
                          <MiniProgress item={item} />
                        </td>
                        <td className="px-3 py-3 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                          {item.scraped_at ? timeAgo(item.scraped_at) : '—'}
                        </td>
                        <td className="px-1 py-3">
                          {hasTipologias && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setExpandedRows(prev => {
                                  const next = new Set(prev)
                                  next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey)
                                  return next
                                })
                              }}
                              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                              title="Ver tipologias"
                            >
                              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasTipologias && (
                        <TipologiasRow key={`${rowKey}-tip`} tipologias={item.tipologias} colSpan={11} />
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
