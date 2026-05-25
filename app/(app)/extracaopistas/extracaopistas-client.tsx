'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parsePreco, fmtBRL, timeAgo, daysAgo } from '@/lib/formatters'
import { portalTable } from '@/lib/portals'
import { PortalBadge } from '@/components/portal-badge'

type Pistas = {
  quadra?: string | null
  conjunto?: string | null
  casa_lote?: string | null
  pontos_referencia?: string[]
  bairro_confirmado?: boolean
  outros_indicios?: string | null
  confianca?: 'alta' | 'media' | 'baixa' | null
}

type Imovel = {
  link: string
  portal: string
  titulo?: string | null
  preco?: string | null
  bairro?: string | null
  descricao?: string | null
  coletado_em?: string | null
  pistas_ia?: Pistas | null
}

type BatchProgress = { done: number; total: number; current: string }

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
    alta: 'bg-green-50 text-green-700 border-green-200',
    media: 'bg-amber-50 text-amber-700 border-amber-200',
    baixa: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${map[confianca] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      confiança {confianca}
    </span>
  )
}

// ── PistasPanel ────────────────────────────────────────────────────────────────
function PistasPanel({ pistas }: { pistas: Pistas }) {
  const fields = [
    { key: 'quadra', label: 'Quadra' },
    { key: 'conjunto', label: 'Conjunto' },
    { key: 'casa_lote', label: 'Casa / Lote' },
    { key: 'bairro_confirmado', label: 'Bairro confirmado' },
    { key: 'outros_indicios', label: 'Outros indícios' },
  ] as const

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-amber-700">Pistas extraídas</span>
        <ConfiancaBadge confianca={pistas.confianca} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">
        {fields.map(({ key, label }) => {
          const val = pistas[key]
          if (val == null || val === '') return null
          return (
            <div key={key}>
              <span className="text-amber-500 text-xs">{label}: </span>
              <span className="text-amber-900">{String(val)}</span>
            </div>
          )
        })}
      </div>
      {pistas.pontos_referencia && pistas.pontos_referencia.length > 0 && (
        <p className="text-xs text-amber-600">{pistas.pontos_referencia.join(' · ')}</p>
      )}
    </div>
  )
}

// ── DescricaoText ──────────────────────────────────────────────────────────────
function DescricaoText({ text }: { text: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <p className="text-sm text-[#656d76] italic">Sem descrição.</p>
  const short = text.slice(0, 500)
  const isLong = text.length > 500
  return (
    <div className="text-sm text-[#656d76] leading-relaxed">
      {expanded ? text : short}
      {isLong && (
        <button onClick={() => setExpanded(!expanded)}
          className="ml-1 text-trk-blue hover:underline text-xs">
          {expanded ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </div>
  )
}

// ── ImovelRow ──────────────────────────────────────────────────────────────────
function ImovelRow({ item, onExtracted, supabase }: {
  item: Imovel
  onExtracted: (link: string, pistas: Pistas) => void
  supabase: ReturnType<typeof createClient>
}) {
  const { toasts, toast } = useToast()
  const [loading, setLoading] = useState(false)
  const preco = parsePreco(item.preco)

  const extract = async () => {
    if (!item.descricao?.trim()) { toast('Sem descrição para analisar.', 'error'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/extrair-pistas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: item.descricao }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const { pistas } = await res.json() as { pistas: Pistas }
      const table = portalTable(item.portal)
      const { error } = await supabase.from(table).update({ pistas_ia: pistas }).eq('link', item.link)
      if (error) throw new Error(error.message)
      onExtracted(item.link, pistas)
      toast('Pistas extraídas com sucesso', 'success')
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white border border-[#d0d7de] rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PortalBadge portal={item.portal} />
              <span className="text-xs text-[#656d76]">{timeAgo(item.coletado_em)}</span>
            </div>
            <p className="text-[#1f2328] font-medium text-sm">{item.titulo || '(sem título)'}</p>
            <p className="text-green-700 font-bold text-sm">{preco ? fmtBRL(preco) : item.preco || '—'}</p>
          </div>
          <button onClick={extract} disabled={loading}
            className="flex-shrink-0 bg-trk-blue hover:bg-[#0860ca] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
            {loading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Extraindo…
              </>
            ) : 'Extrair pistas'}
          </button>
        </div>
        <div className={`grid gap-4 ${item.pistas_ia ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <DescricaoText text={item.descricao} />
          {item.pistas_ia && <PistasPanel pistas={item.pistas_ia} />}
        </div>
      </div>
      <ToastStack toasts={toasts} />
    </>
  )
}

// ── ExtracaoPistasClient ───────────────────────────────────────────────────────
export function ExtracaoPistasClient() {
  const { toasts, toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Imovel[]>([])
  const [loading, setLoading] = useState(true)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('imoveis_todos')
        .select('link,titulo,preco,bairro,descricao,coletado_em,pistas_ia,portal')
        .eq('status_triagem', 'aprovado')
        .is('pistas_ia', null)
        .gte('coletado_em', daysAgo(3))
        .order('coletado_em', { ascending: false })
        .range(0, 999)
      setItems((data as Imovel[]) ?? [])
      setLoading(false)
    }
    load()
  }, [supabase])

  const handleExtracted = useCallback((link: string, pistas: Pistas) => {
    setItems(prev => prev.map(i => i.link === link ? { ...i, pistas_ia: pistas } : i))
  }, [])

  const extractAll = async () => {
    const pending = items.filter(i => !i.pistas_ia && i.descricao?.trim())
    if (!pending.length) return
    setBatchRunning(true)
    let done = 0
    for (const item of pending) {
      setBatchProgress({ done, total: pending.length, current: item.titulo ?? '' })
      try {
        const res = await fetch('/api/extrair-pistas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descricao: item.descricao }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { pistas } = await res.json() as { pistas: Pistas }
        const table = portalTable(item.portal)
        await supabase.from(table).update({ pistas_ia: pistas }).eq('link', item.link)
        handleExtracted(item.link, pistas)
        done++
      } catch { /* continue on error */ }
      await new Promise(r => setTimeout(r, 1200))
    }
    setBatchRunning(false)
    setBatchProgress(null)
    toast(`${done}/${pending.length} extrações concluídas`, 'success')
  }

  const pending = items.filter(i => !i.pistas_ia)
  const processed = items.filter(i => !!i.pistas_ia)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2328]">Extração de Pistas</h1>
          <p className="text-[#656d76] text-sm mt-1">Imóveis aprovados aguardando análise de endereço pela IA</p>
        </div>
        <button onClick={extractAll} disabled={batchRunning || loading || pending.length === 0}
          className="bg-trk-blue hover:bg-[#0860ca] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2">
          {batchRunning ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {batchProgress ? `${batchProgress.done}/${batchProgress.total}` : 'Processando…'}
            </>
          ) : `Extrair todos (${pending.length})`}
        </button>
      </div>

      {batchProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-700">Processando em lote…</span>
            <span className="text-xs text-blue-600">{batchProgress.done}/{batchProgress.total}</span>
          </div>
          <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-trk-blue rounded-full transition-all duration-500"
              style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-[#656d76] mt-2 truncate">{batchProgress.current}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg animate-pulse bg-[#f6f8fa] border border-[#d0d7de]" />
          ))}
        </div>
      ) : pending.length === 0 && processed.length === 0 ? (
        <div className="text-center py-20 text-[#656d76]">
          <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <p className="font-medium text-[#1f2328] text-lg">Tudo processado</p>
          <p className="text-sm mt-1">Não há imóveis aprovados aguardando análise.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map(item => (
            <ImovelRow key={`${item.portal}-${item.link}`} item={item} onExtracted={handleExtracted} supabase={supabase} />
          ))}
          {processed.length > 0 && pending.length > 0 && (
            <div className="border-t border-[#d0d7de] pt-4 mt-2">
              <p className="text-xs font-semibold text-[#656d76] uppercase tracking-wide mb-3">Já processados nesta sessão ({processed.length})</p>
            </div>
          )}
          {processed.map(item => (
            <ImovelRow key={`${item.portal}-${item.link}`} item={item} onExtracted={handleExtracted} supabase={supabase} />
          ))}
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  )
}
