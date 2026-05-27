'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { parsePreco, fmtBRL, timeAgo } from '@/lib/formatters'
import { PortalBadge } from '@/components/portal-badge'
import type { Pistas } from '@/lib/extrair-pistas'

// ── Types ──────────────────────────────────────────────────────────────────────

type Imovel = {
  link: string
  portal: string
  titulo?: string | null
  preco?: string | null
  bairro?: string | null
  descricao?: string | null
  imagens?: string | null
  coletado_em?: string | null
  pistas_ia?: Pistas | null
}

type ProcessingState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number; titulo: string }
  | { status: 'done'; processed: number; errors: number; remaining: number }
  | { status: 'error'; message: string }

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

// ── ConfiancaBadge ─────────────────────────────────────────────────────────────

function ConfiancaBadge({ confianca }: { confianca?: string | null }) {
  if (!confianca) return null
  const map: Record<string, string> = {
    alta:  'bg-green-50 text-green-700 border-green-200',
    media: 'bg-amber-50 text-amber-700 border-amber-200',
    baixa: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${map[confianca] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      confiança {confianca}
    </span>
  )
}

function FonteBadge({ fonte }: { fonte?: string | null }) {
  if (!fonte) return null
  const map: Record<string, string> = {
    texto:         'bg-blue-50 text-blue-600 border-blue-200',
    imagem:        'bg-purple-50 text-purple-600 border-purple-200',
    'texto+imagem':'bg-teal-50 text-teal-600 border-teal-200',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${map[fonte] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      via {fonte}
    </span>
  )
}

// ── PistasPanel ────────────────────────────────────────────────────────────────

const PISTAS_FIELDS: { key: keyof Pistas; label: string }[] = [
  { key: 'quadra',           label: 'Quadra'       },
  { key: 'conjunto',         label: 'Conjunto'     },
  { key: 'bloco',            label: 'Bloco'        },
  { key: 'numero_ap',        label: 'Ap.'          },
  { key: 'andar',            label: 'Andar'        },
  { key: 'casa_lote',        label: 'Casa / Lote'  },
  { key: 'rua',              label: 'Rua'          },
  { key: 'bairro_confirmado',label: 'Bairro conf.' },
  { key: 'outros_indicios',  label: 'Outros'       },
]

function hasDados(pistas: Pistas) {
  return PISTAS_FIELDS.some(({ key }) => {
    const v = pistas[key]
    return v != null && v !== '' && v !== false
  }) || (pistas.pontos_referencia?.length ?? 0) > 0
}

function PistasPanel({ pistas }: { pistas: Pistas }) {
  if (!hasDados(pistas)) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        <span className="text-xs text-slate-500">Sem pistas de endereço na descrição</span>
      </div>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold text-amber-700">Pistas extraídas</span>
        <ConfiancaBadge confianca={pistas.confianca} />
        <FonteBadge fonte={pistas.fonte} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
        {PISTAS_FIELDS.map(({ key, label }) => {
          const val = pistas[key]
          if (val == null || val === '') return null
          return (
            <div key={key}>
              <span className="text-amber-500 text-xs">{label}: </span>
              <span className="text-amber-900 font-medium">{String(val)}</span>
            </div>
          )
        })}
      </div>
      {pistas.pontos_referencia && pistas.pontos_referencia.length > 0 && (
        <p className="text-xs text-amber-600 italic">{pistas.pontos_referencia.join(' · ')}</p>
      )}
    </div>
  )
}

// ── ImageStrip ─────────────────────────────────────────────────────────────────

function parseUrls(imagens: string | null | undefined): string[] {
  if (!imagens) return []
  const t = imagens.trim()
  if (t.startsWith('[')) { try { return JSON.parse(t) } catch { /* fall */ } }
  return t.split('\n').map(u => u.trim()).filter(Boolean)
}

function ImageStrip({ imagens }: { imagens: string | null | undefined }) {
  const urls = parseUrls(imagens).slice(0, 4)
  if (urls.length === 0) return null
  return (
    <div className="flex gap-2 mt-3 mb-1">
      {urls.map((url, i) => (
        <img
          key={i}
          src={`/api/img?url=${encodeURIComponent(url)}`}
          alt=""
          className="w-20 h-14 object-cover rounded-md border border-[#d0d7de] bg-[#f6f8fa]"
          loading="lazy"
        />
      ))}
    </div>
  )
}

// ── DescricaoText ──────────────────────────────────────────────────────────────

function DescricaoText({ text }: { text: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <p className="text-sm text-[#656d76] italic">Sem descrição — extração manual necessária.</p>
  const short = text.slice(0, 400)
  const isLong = text.length > 400
  return (
    <div className="text-sm text-[#656d76] leading-relaxed">
      {expanded ? text : short}
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="ml-1 text-trk-blue hover:underline text-xs">
          {expanded ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </div>
  )
}

// ── ImovelRow ──────────────────────────────────────────────────────────────────

function ImovelRow({ item, onExtracted }: {
  item: Imovel
  onExtracted: (link: string, pistas: Pistas) => void
}) {
  const { toasts, toast } = useToast()
  const [loading, setLoading] = useState(false)
  const preco = parsePreco(item.preco)

  const extract = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/extrair-pistas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: item.descricao, imagens: item.imagens }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const { pistas } = await res.json() as { pistas: Pistas }

      const saveRes = await fetch('/api/extracaopistas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: item.link, portal: item.portal, pistas }),
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${saveRes.status}`)
      }

      onExtracted(item.link, pistas)
      toast('Pistas extraídas', 'success')
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white border border-[#d0d7de] rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <PortalBadge portal={item.portal} />
              <span className="text-xs text-[#656d76]">{timeAgo(item.coletado_em)}</span>
            </div>
            <p className="text-[#1f2328] font-medium text-sm">{item.titulo || '(sem título)'}</p>
            <p className="text-green-700 font-bold text-sm">{preco ? fmtBRL(preco) : item.preco || '—'}</p>
            <ImageStrip imagens={item.imagens} />
          </div>
          <button
            onClick={extract}
            disabled={loading}
            className="flex-shrink-0 bg-trk-blue hover:bg-[#0860ca] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Extraindo…</>
            ) : 'Extrair com imagens'}
          </button>
        </div>

        <div className={`mt-4 grid gap-4 ${item.pistas_ia ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <DescricaoText text={item.descricao} />
          {item.pistas_ia && <PistasPanel pistas={item.pistas_ia} />}
        </div>
      </div>
      <ToastStack toasts={toasts} />
    </>
  )
}

// ── ProcessingBanner ───────────────────────────────────────────────────────────

function ProcessingBanner({ state, onRetry }: { state: ProcessingState; onRetry: () => void }) {
  if (state.status === 'idle') return null

  if (state.status === 'running') {
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm text-blue-700 font-medium">Processando automaticamente…</span>
          </div>
          <span className="text-xs text-blue-600 tabular-nums">{state.done}/{state.total}</span>
        </div>
        <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-trk-blue rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-[#656d76] mt-2 truncate">{state.titulo}</p>
      </div>
    )
  }

  if (state.status === 'done') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-green-700">
            Processamento concluído — {state.processed} extraídos
            {state.errors > 0 && <span className="text-amber-600"> · {state.errors} falhas</span>}
          </p>
          {state.remaining > 0 && (
            <p className="text-xs text-[#656d76] mt-0.5">
              {state.remaining} imóveis ainda sem pistas (sem descrição ou falha) — use os botões abaixo para extrair com imagens.
            </p>
          )}
        </div>
        {state.remaining > 0 && (
          <button onClick={onRetry} className="text-xs text-trk-blue hover:underline flex-shrink-0 ml-4">
            Processar mais
          </button>
        )}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-red-700">{state.message}</p>
      </div>
    )
  }

  return null
}

// ── ExtracaoPistasClient ───────────────────────────────────────────────────────

export function ExtracaoPistasClient() {
  const { toasts, toast } = useToast()
  const [items, setItems] = useState<Imovel[]>([])
  const [processados, setProcessados] = useState<Imovel[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle' })
  const [showProcessados, setShowProcessados] = useState(true)

  const loadFailures = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/extracaopistas?tipo=pendentes')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems(await res.json())
    } catch { /* silencioso — lista fica como estava */ }
    finally { setLoadingList(false) }
  }, [])

  const loadProcessados = useCallback(async () => {
    try {
      const res = await fetch('/api/extracaopistas?tipo=processados')
      if (!res.ok) return
      setProcessados(await res.json())
    } catch { /* silencioso */ }
  }, [])

  const runProcessing = useCallback(async () => {
    setProcessing({ status: 'running', done: 0, total: 0, titulo: '' })
    try {
      const res = await fetch('/api/processar-pistas', { method: 'POST' })
      if (!res.body) throw new Error('Sem stream de resposta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'start') {
              setProcessing({ status: 'running', done: 0, total: event.total, titulo: '' })
            } else if (event.type === 'progress') {
              setProcessing({ status: 'running', done: event.done, total: event.total, titulo: event.titulo })
            } else if (event.type === 'done') {
              setProcessing({ status: 'done', processed: event.processed, errors: event.errors, remaining: event.remaining })
              await Promise.all([loadFailures(), loadProcessados()])
            } else if (event.type === 'error') {
              setProcessing({ status: 'error', message: event.message })
            }
          } catch { /* linha malformada */ }
        }
      }
    } catch (err) {
      setProcessing({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
      toast('Erro no processamento automático', 'error')
    }
  }, [loadFailures, loadProcessados, toast])

  useEffect(() => { runProcessing() }, [runProcessing])

  const handleExtracted = useCallback((link: string, pistas: Pistas) => {
    setItems(prev => prev.filter(i => i.link !== link))
    toast('Pistas salvas — imóvel removido da fila', 'success')
  }, [toast])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2328]">Extração de Pistas</h1>
          <p className="text-[#656d76] text-sm mt-1">
            Novos imóveis são processados automaticamente. Os listados abaixo precisam de revisão manual.
          </p>
        </div>
      </div>

      <ProcessingBanner state={processing} onRetry={runProcessing} />

      {loadingList ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg animate-pulse bg-[#f6f8fa] border border-[#d0d7de]" />
          ))}
        </div>
      ) : items.length === 0 && processing.status === 'done' ? (
        <div className="text-center py-20 text-[#656d76]">
          <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <p className="font-medium text-[#1f2328] text-lg">Tudo processado</p>
          <p className="text-sm mt-1">Nenhum imóvel aguardando revisão de endereço.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.length > 0 && (
            <p className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">
              {items.length} aguardando revisão — sem descrição ou falha na extração automática
            </p>
          )}
          {items.map(item => (
            <ImovelRow
              key={`${item.portal}-${item.link}`}
              item={item}
              onExtracted={handleExtracted}
            />
          ))}
        </div>
      )}

      {processados.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowProcessados(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-[#656d76] uppercase tracking-wide mb-3 hover:text-[#1f2328] transition-colors"
          >
            <svg
              className="w-3.5 h-3.5 transition-transform duration-150"
              style={{ transform: showProcessados ? 'none' : 'rotate(-90deg)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Processados com pistas ({processados.length})
          </button>

          {showProcessados && (
            <div className="flex flex-col gap-3">
              {processados.map(item => (
                <div key={`proc-${item.portal}-${item.link}`} className="bg-white border border-[#d0d7de] rounded-lg p-4 shadow-sm opacity-80">
                  <div className="flex items-center gap-2 mb-2">
                    <PortalBadge portal={item.portal} />
                    <span className="text-xs text-[#656d76]">{timeAgo(item.coletado_em)}</span>
                    <span className="text-sm text-[#1f2328] font-medium truncate">{item.titulo || '(sem título)'}</span>
                  </div>
                  <div className="flex gap-4">
                    <ImageStrip imagens={item.imagens} />
                    {item.pistas_ia && <PistasPanel pistas={item.pistas_ia} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  )
}
