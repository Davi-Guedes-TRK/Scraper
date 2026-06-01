'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { timeAgo } from '@/lib/formatters'
import { LANCAMENTO_FONTES, lancamentoFontes } from '@/lib/portals'

// Monitorados na UI (incluindo os que rodam só via GH Actions)
const PORTALS_LOCACAO = [
  { key: 'dfimoveis',   label: 'DFImóveis' },
  { key: 'olx',         label: 'OLX Brasil' },
  { key: 'vivareal',    label: 'Viva Real' },
  { key: 'zap',         label: 'ZAP' },
  { key: 'chavesnamao', label: 'Chaves na Mão' },
] as const

// Disponíveis no disparo manual (têm scraper acessível via /api/scrapers/run)
const PORTALS = [
  { key: 'dfimoveis', label: 'DFImóveis' },
  { key: 'olx',       label: 'OLX Brasil' },
] as const

type PortalDef = { key: string; label: string }

const CIDADES = [
  'todos','brasilia','lago-sul','park-sul','park-way','asa-sul','asa-norte',
  'lago-norte','noroeste','sudoeste','jardim-botanico',
  'aguas-claras','taguatinga','ceilandia','guara','sobradinho',
  'vicente-pires','samambaia',
]

const TRK_REGIOES = ['lago-sul','park-sul','park-way','asa-sul','asa-norte','jardim-botanico','lago-norte','sudoeste','noroeste']

const STATUS_DOT: Record<string, string> = {
  ativo: 'bg-green-500', pausado: 'bg-amber-500', erro: 'bg-red-500',
}

// ── Toast ──────────────────────────────────────────────────────────────────────
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const id = useRef(0)
  const toast = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const tid = ++id.current
    setToasts(ts => [...ts, { id: tid, msg, type }])
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== tid)), 3500)
  }, [])
  return { toasts, toast }
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white ${
          t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-zinc-700'
        }`}>{t.msg}</div>
      ))}
    </div>
  )
}

// ── LogsModal ──────────────────────────────────────────────────────────────────
type ScraperLog = { id: string; portal: string; status: string; mensagem: string; total_coletado: number; created_at: string }

function LogsModal({ title, logs, loading, onClose }: {
  title: string; logs: ScraperLog[]; loading: boolean; onClose: () => void
}) {
  return (
    <div role="button" tabIndex={0} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="rounded-lg w-full max-w-2xl shadow-xl border border-border" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-foreground font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>
        <div className="p-5 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse bg-muted" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Nenhum log registrado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map(log => (
                <div key={log.id} className="bg-muted border border-border rounded-lg p-3 flex items-start gap-3">
                  <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                    log.status === 'ativo' ? 'bg-green-500' : log.status === 'erro' ? 'bg-red-500' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                    {log.total_coletado > 0 && (
                      <span className="ml-2 text-xs text-green-600">+{log.total_coletado} imóveis</span>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 break-words">{log.mensagem}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PortalCard ─────────────────────────────────────────────────────────────────
type PortalStats = {
  ultimoRegistro: string | null
  countToday: number
  count3d: number
  status: string
  ultimoLog: ScraperLog | null
}

function PortalCard({ portal }: { portal: PortalDef }) {
  const [stats, setStats] = useState<PortalStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<ScraperLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setStatsLoading(true)
      try {
        const res = await fetch(`/api/scrapers/stats?portal=${portal.key}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setStats(await res.json())
      } catch { /* mostra vazio */ }
      finally { setStatsLoading(false) }
    }
    load()
  }, [portal.key])

  const openLogs = async () => {
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/scrapers/logs?portal=${portal.key}`)
      if (res.ok) setLogs(await res.json())
    } catch { /* silencioso */ }
    finally { setLogsLoading(false) }
  }

  return (
    <>
      <div className="card rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{portal.label}</h3>
            {!statsLoading && stats && (
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[stats.status] ?? 'bg-slate-400'}`} />
                <span className="text-xs text-muted-foreground capitalize">{stats.status}</span>
              </span>
            )}
          </div>
          <button onClick={openLogs} className="text-xs text-primary hover:underline transition-colors">
            Ver logs
          </button>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg animate-pulse bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Última coleta</span>
              <span className="text-sm text-foreground">{stats?.ultimoRegistro ? timeAgo(stats.ultimoRegistro) : '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Hoje</span>
              <span className="text-2xl font-bold text-foreground tabular">{stats?.countToday ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Últimos 3 dias</span>
              <span className="text-2xl font-bold text-green-600 tabular">{stats?.count3d ?? '—'}</span>
            </div>
          </div>
        )}

        {stats?.ultimoLog?.mensagem && (
          <p className="mt-3 text-xs text-muted-foreground truncate">{stats.ultimoLog.mensagem}</p>
        )}
      </div>

      {logsOpen && (
        <LogsModal
          title={`Logs — ${portal.label}`}
          logs={logs}
          loading={logsLoading}
          onClose={() => setLogsOpen(false)}
        />
      )}
    </>
  )
}

// ── RunPanel ───────────────────────────────────────────────────────────────────
function RunPanel() {
  const { toasts, toast } = useToast()
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const [portal, setPortal]           = useState('dfimoveis')
  const [paginas, setPaginas]         = useState(20)
  const [cidade, setCidade]           = useState('todos')
  const [tipo, setTipo]               = useState('aluguel')
  const [tipoImovel, setTipoImovel]   = useState('todos')
  const [estado, setEstado]           = useState('df')
  const [fastMode, setFastMode]       = useState(false)
  const [publicadosHa, setPublicadosHa] = useState(0)

  const [running, setRunning]         = useState(false)
  const [logs, setLogs]               = useState<string[]>([])
  const [done, setDone]               = useState<{ code: number } | null>(null)

  const addLog = (text: string) => setLogs(prev => [...prev, text])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const start = () => {
    if (running) return
    setLogs([])
    setDone(null)
    setRunning(true)

    const params = new URLSearchParams({
      portal, paginas: String(paginas), cidade, tipo,
      tipo_imovel: tipoImovel, estado, fast: String(fastMode),
      publicados_ha: String(publicadosHa),
    })
    const es = new EventSource(`/api/scrapers/run?${params}`)
    esRef.current = es

    es.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { type: string; cmd?: string; text?: string; code?: number; cidade?: string }
      if (data.type === 'start') addLog(`> ${data.cmd}`)
      else if (data.type === 'log') addLog(data.text ?? '')
      else if (data.type === 'error') { addLog(`ERRO: ${data.text}`); setRunning(false); es.close() }
      else if (data.type === 'done') {
        setDone({ code: data.code ?? 0 })
        setRunning(false)
        es.close()
        if (data.code === 0) toast('Coleta finalizada', 'success')
        else toast(`Encerrou com código ${data.code}`, 'error')
      }
    }
    es.onerror = () => { addLog('Conexão perdida.'); setRunning(false); es.close() }
  }

  const stop = () => { esRef.current?.close(); setRunning(false); addLog('Parado pelo usuário.') }

  const isDFI = portal === 'dfimoveis'
  const isOLX = portal === 'olx'

  const sel = 'bg-muted border border-border text-foreground text-sm rounded-lg px-3 py-2 outline-none focus:border-primary w-full disabled:opacity-40'
  const pill = (active: boolean) => `text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 ${
    active
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
  }`

  return (
    <div className="card rounded-lg overflow-hidden">
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 border-b border-border">
        {/* Coluna esquerda */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#656d76] font-medium">Portal</label>
            <div className="flex gap-2">
              {PORTALS.map(p => (
                <button key={p.key} disabled={running} onClick={() => setPortal(p.key)} className={pill(portal === p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#656d76] font-medium">Páginas</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={200} value={paginas} disabled={running}
                  onChange={e => setPaginas(Number(e.target.value))}
                  className="bg-[#f6f8fa] border border-[#d0d7de] text-[#1f2328] text-center text-sm rounded-lg py-1 px-2 w-16 outline-none focus:border-trk-blue disabled:opacity-40" />
                <span className="text-xs text-[#656d76]">~{paginas * 20} anúncios</span>
              </div>
            </div>
            <input type="range" min={1} max={100} value={Math.min(paginas, 100)} disabled={running}
              onChange={e => setPaginas(Number(e.target.value))}
              className="w-full accent-trk-blue disabled:opacity-40" />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#656d76] font-medium">Modo</label>
            <div className="flex gap-2">
              <button disabled={running} onClick={() => setFastMode(false)} className={pill(!fastMode)}>Completo</button>
              <button disabled={running} onClick={() => setFastMode(true)} className={pill(fastMode)}>Rápido</button>
            </div>
            <p className="text-xs text-[#656d76]">
              {fastMode
                ? 'Só dados da listagem. Mais rápido.'
                : 'Acessa cada anúncio: telefone, CRECI, fotos. Mais lento.'}
            </p>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col gap-4">
          {isDFI && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#656d76] font-medium">Região</label>
              <div className="flex gap-2 items-center">
                <button type="button" disabled={running}
                  onClick={() => setCidade(cidade === 'trk-preset' ? 'todos' : 'trk-preset')}
                  className={pill(cidade === 'trk-preset')}>
                  Preset TRK
                </button>
                <div className="relative flex-1">
                  <select value={cidade === 'trk-preset' ? 'todos' : cidade}
                    disabled={running || cidade === 'trk-preset'}
                    onChange={e => setCidade(e.target.value)} className={sel}>
                    {CIDADES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {cidade === 'trk-preset' && (
                <p className="text-xs text-[#656d76] font-mono">{TRK_REGIOES.join(' · ')}</p>
              )}
            </div>
          )}

          {isOLX && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#656d76] font-medium">Estado (UF)</label>
              <div className="flex gap-2 items-center">
                <input value={estado} disabled={running}
                  onChange={e => setEstado(e.target.value.toLowerCase())}
                  maxLength={2} placeholder="DF"
                  className="bg-[#f6f8fa] border border-[#d0d7de] text-[#1f2328] text-center text-sm rounded-lg py-2 px-2 w-14 outline-none focus:border-trk-blue disabled:opacity-40" />
                {['df','go','sp'].map(uf => (
                  <button key={uf} type="button" disabled={running} onClick={() => setEstado(uf)} className={pill(estado === uf)}>
                    {uf.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isDFI && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#656d76] font-medium">Tipo de imóvel</label>
              <select value={tipoImovel} disabled={running} onChange={e => setTipoImovel(e.target.value)} className={sel}>
                {['todos','casa','apartamento','casa-condominio','lote','sala'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#656d76] font-medium">Publicados há</label>
            <div className="flex flex-wrap gap-2">
              {[{ label: 'Qualquer', val: 0 }, { label: '1 dia', val: 1 }, { label: '3 dias', val: 3 }, { label: '7 dias', val: 7 }].map(({ label, val }) => (
                <button key={val} type="button" disabled={running} onClick={() => setPublicadosHa(val)} className={pill(publicadosHa === val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-border">
        {running ? (
          <span className="text-xs text-[#656d76]">Coletando…</span>
        ) : !fastMode ? (() => {
          const regioes = cidade === 'trk-preset' ? TRK_REGIOES.length : 1
          const mins = Math.round((paginas * 20 * regioes * 4) / 60)
          return <span className="text-xs text-amber-600">Modo completo · estimativa ~{mins} min para {paginas * 20 * regioes} anúncios</span>
        })() : <span />}
        <div className="flex gap-2">
          {running ? (
            <button onClick={stop}
              className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              Parar
            </button>
          ) : (
            <button onClick={start}
              className="bg-primary hover:bg-primary-h text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              Iniciar coleta
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div>
        <div className="px-4 py-2 border-b border-border flex items-center justify-between" style={{ background: 'var(--secondary)' }}>
          <span className="text-xs text-muted-foreground font-mono">output</span>
          <div className="flex gap-3">
            <button onClick={() => { if (logs.length) navigator.clipboard.writeText(logs.join('\n')).then(() => toast('Logs copiados', 'success')) }}
              disabled={!logs.length}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              copiar
            </button>
            <button onClick={() => { setLogs([]); setDone(null) }} disabled={!logs.length && !done}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              limpar
            </button>
          </div>
        </div>
        <div ref={logRef}
          className="bg-zinc-950 font-mono text-xs text-slate-300 p-4 h-64 overflow-y-auto"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {logs.length === 0 ? (
            <span className="text-zinc-600">Aguardando início…</span>
          ) : (
            logs.map((line, i) => {
              let cls = 'text-slate-400'
              if (line.startsWith('>')) cls = 'text-cyan-400'
              else if (/ERRO|erro|error/i.test(line)) cls = 'text-red-400'
              else if (/\[OK\]|conclu|finaliz/i.test(line)) cls = 'text-green-400'
              else if (line.startsWith('━━━')) cls = 'text-purple-400'
              else if (/Parado/i.test(line)) cls = 'text-amber-400'
              return <div key={i} className={cls}>{line}</div>
            })
          )}
          {done && (
            <div className={`mt-2 font-bold ${done.code === 0 ? 'text-green-400' : 'text-red-400'}`}>
              {done.code === 0 ? 'Finalizado com sucesso' : `Encerrou com código ${done.code}`}
            </div>
          )}
        </div>
      </div>
      <ToastStack toasts={toasts} />
    </div>
  )
}

// ── LancamentoCard ─────────────────────────────────────────────────────────────
type FonteStats = { fonte: string; total: number; ultimo: string | null }

function LancamentoCard({ fonte, label, hex, stats }:
  { fonte: string; label: string; hex: string; stats?: FonteStats }) {
  const total = stats?.total ?? 0
  const ultimo = stats?.ultimo
  const daysSince = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000) : null
  const staleness = daysSince === null ? '' : daysSince > 7 ? 'text-red-400' : daysSince > 3 ? 'text-amber-400' : 'text-muted-foreground'

  return (
    <div className="card rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: hex }} />
        <h3 className="font-semibold text-foreground text-sm">{label}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Coletados</span>
          <span className="text-2xl font-bold text-foreground tabular">{total}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Última coleta</span>
          <span className={`text-sm font-mono ${staleness}`}>{ultimo ? timeAgo(ultimo) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

function LancamentosSection() {
  const [stats, setStats] = useState<FonteStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/empreendimentos')
      .then(r => r.json())
      .then((d: { stats: FonteStats[] }) => setStats(d.stats ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#656d76]">Lançamentos · Construtoras DF</h2>
        <span className="text-[10px] text-[#656d76] font-mono">via GitHub Actions · 07:00 BRT</span>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg animate-pulse bg-[#f6f8fa]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lancamentoFontes.map(key => {
            const def = LANCAMENTO_FONTES[key]
            const s = stats.find(x => x.fonte === key)
            return <LancamentoCard key={key} fonte={key} label={def.label} hex={def.hex} stats={s} />
          })}
        </div>
      )}
    </div>
  )
}

// ── ScrapersClient ─────────────────────────────────────────────────────────────
export function ScrapersClient() {
  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display">Scrapers</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitoramento e disparo manual das coletas.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow text-muted-foreground">Locação · Portais</h2>
          <span className="text-[10px] text-muted-foreground font-mono">vivareal/zap/chaves rodam via GH Actions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PORTALS_LOCACAO.map(p => <PortalCard key={p.key} portal={p} />)}
        </div>
      </div>

      <LancamentosSection />

      <div className="flex flex-col gap-3">
        <h2 className="eyebrow text-muted-foreground">Disparo manual · DFImóveis / OLX</h2>
        <RunPanel />
      </div>
    </div>
  )
}
