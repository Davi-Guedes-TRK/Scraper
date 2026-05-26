'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { classifyAnunciante, parsePreco, fmtBRL, timeAgo, allImgs, parseLatLng, dedupKey, daysAgo, startOfToday } from '@/lib/formatters'
import { portalLabel, portalTable } from '@/lib/portals'
import { PortalBadge } from '@/components/portal-badge'
import { MatriculaModal } from './matricula-modal'

const PAGE_SIZE = 20

type Imovel = {
  link: string
  portal: string
  titulo?: string | null
  preco?: string | null
  bairro?: string | null
  cidade?: string | null
  area_m2?: string | null
  quartos?: string | null
  descricao?: string | null
  imagens?: string | null
  coletado_em?: string | null
  data_publicacao?: string | null
  pistas_ia?: Record<string, unknown> | null
  tipo_imovel?: string | null
  creci?: string | null
  nome_anunciante?: string | null
  tipo_anunciante?: string | null
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
        }`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getRegiao(item: Imovel) {
  const raw = item.cidade || item.bairro || ''
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function addressScore(item: Imovel) {
  const p = (item.pistas_ia ?? {}) as Record<string, unknown>
  return (p.conjunto ? 3 : 0) + (p.quadra ? 2 : 0) + (p.casa_lote ? 1 : 0)
}

function timeAnunciado(pub: string | null | undefined) {
  if (!pub) return null
  const d = Math.floor((Date.now() - new Date(pub).getTime()) / 86400000)
  if (d <= 0) return 'anunciado hoje'
  if (d === 1) return 'anunciado há 1 dia'
  return `anunciado há ${d} dias`
}

async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: Imovel[] | null; error: unknown }>
): Promise<Imovel[]> {
  const PAGE = 1000
  let offset = 0
  const rows: Imovel[] = []
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function Lightbox({ imgs, startIdx, title, onClose }: { imgs: string[]; startIdx: number; title?: string | null; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx)
  const prev = useCallback(() => setIdx(i => (i - 1 + imgs.length) % imgs.length), [imgs.length])
  const next = useCallback(() => setIdx(i => (i + 1) % imgs.length), [imgs.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-medium truncate max-w-lg">{title}</p>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{idx + 1} / {imgs.length}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative min-h-0" onClick={e => e.stopPropagation()}>
        {imgs.length > 1 && (
          <button onClick={prev} className="absolute left-3 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center text-lg transition-colors">‹</button>
        )}
        <img key={idx} src={imgs[idx]} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" onError={e => { (e.target as HTMLImageElement).src = '' }} />
        {imgs.length > 1 && (
          <button onClick={next} className="absolute right-3 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center text-lg transition-colors">›</button>
        )}
      </div>
      {imgs.length > 1 && (
        <div className="flex gap-1.5 px-4 py-3 overflow-x-auto flex-shrink-0" onClick={e => e.stopPropagation()}>
          {imgs.map((src, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`flex-shrink-0 w-14 h-10 rounded overflow-hidden border-2 transition-colors ${i === idx ? 'border-trk-blue' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ReviewPanel — painel central inline ────────────────────────────────────────
function ReviewPanel({ item, onApprove, onVisitar, onDiscard, onClose }: {
  item: Imovel
  onApprove: (item: Imovel, data: { endereco: string; mapsLink: string }) => Promise<void>
  onVisitar: (item: Imovel, data: { endereco: string; mapsLink: string }) => Promise<void>
  onDiscard: (item: Imovel) => Promise<void>
  onClose: () => void
}) {
  const imgs = allImgs(item.imagens)
  const [endereco, setEndereco] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [matriculaOpen, setMatriculaOpen] = useState(false)

  useEffect(() => {
    setEndereco('')
    setMapsLink('')
    if (item.pistas_ia) {
      const p = item.pistas_ia as Record<string, string>
      const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean)
      if (parts.length) setEndereco(parts.join(', '))
    }
  }, [item.link, item.pistas_ia])

  const preco = parsePreco(item.preco)
  const pistas = (item.pistas_ia ?? {}) as Record<string, unknown>
  const pistaFields = [
    { key: 'quadra', label: 'Quadra' },
    { key: 'conjunto', label: 'Conjunto' },
    { key: 'casa_lote', label: 'Casa/Lote' },
    { key: 'bairro_confirmado', label: 'Bairro' },
    { key: 'outros_indicios', label: 'Indícios' },
  ].filter(f => pistas[f.key])

  const canSave = !saving && !!endereco.trim()
  const approve = async () => { setSaving(true); await onApprove(item, { endereco, mapsLink }); setSaving(false) }
  const visitar = async () => { setSaving(true); await onVisitar(item, { endereco, mapsLink }); setSaving(false) }
  const discard = async () => { setSaving(true); await onDiscard(item); setSaving(false) }
  const fsbo = classifyAnunciante(item)

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── header ── */}
        <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <PortalBadge portal={item.portal} />
                {fsbo === 'proprietario' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--approve-bg)', color: 'var(--approve-fg)' }}>Proprietário</span>
                )}
                {fsbo === 'corretor' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Corretor</span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">{item.titulo || '(sem título)'}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {[item.bairro, item.cidade?.replace(/-/g, ' ')].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <button onClick={onClose}
              className="text-muted-foreground hover:text-foreground w-6 h-6 flex items-center justify-center rounded transition-colors flex-shrink-0"
              aria-label="Fechar">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-sm font-bold text-foreground tabular">{preco ? fmtBRL(preco) : item.preco || '—'}</span>
            {item.area_m2 && <span className="text-[11px] text-muted-foreground">{item.area_m2} m²</span>}
            {item.quartos && <span className="text-[11px] text-muted-foreground">{item.quartos} qtos</span>}
            <a href={item.link} target="_blank" rel="noreferrer" className="ml-auto text-[10px] text-primary hover:underline">Ver anúncio ↗</a>
          </div>
        </div>

        {/* ── grade de fotos 3×2 (Figma) ── */}
        {imgs.length > 0 ? (
          <div className="flex-shrink-0 h-[240px] grid gap-px" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', background: 'var(--border)' }}>
            {imgs.slice(0, 6).map((src, i) => (
              <button key={i} onClick={() => { setZoomIdx(i); setZoom(true) }}
                className="relative overflow-hidden bg-zinc-900 group h-full w-full">
                <img src={src} alt="" referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                {i === 5 && imgs.length > 6 && (
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">+{imgs.length - 6}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-shrink-0 h-20 flex items-center justify-center text-muted-foreground/30" style={{ background: 'var(--muted)' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
          </div>
        )}

        {/* ── corpo scrollável ── */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">

          {pistaFields.length > 0 && (
            <div className="rounded-lg p-2.5 border" style={{ background: 'color-mix(in srgb, #f59e0b 8%, var(--card))', borderColor: 'color-mix(in srgb, #f59e0b 30%, transparent)' }}>
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 font-mono">Pistas da IA</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {pistaFields.map(({ key, label }) => (
                  <div key={key}>
                    <span className="text-[9px] text-amber-500 uppercase font-mono">{label}</span>
                    <p className="text-[11px] text-foreground font-medium leading-tight">{String(pistas[key])}</p>
                  </div>
                ))}
              </div>
              {Array.isArray((pistas as Record<string, unknown>).pontos_referencia) && ((pistas as Record<string, string[]>).pontos_referencia).length > 0 && (
                <p className="text-[10px] text-amber-600 mt-1.5">{((pistas as Record<string, string[]>).pontos_referencia).join(' · ')}</p>
              )}
            </div>
          )}

          {item.descricao && (
            <div className="rounded-lg border border-border overflow-hidden" style={{ background: 'var(--muted)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wider px-2.5 pt-2 pb-0.5 font-mono text-muted-foreground">
                {item.portal === 'olx' ? 'Características' : 'Descrição'}
              </p>
              <div className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line px-2.5 pb-2 max-h-28 overflow-y-auto">
                {item.descricao}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1">
              Endereço <span className="text-destructive">*</span>
              <span className="font-normal text-muted-foreground"> — obrigatório p/ aprovar</span>
            </label>
            <div className="flex gap-1">
              <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder="QL 14 Conjunto 3 Casa 12, Lago Sul"
                className="flex-1 bg-muted border border-border text-foreground text-xs rounded-lg px-3 py-1.5 outline-none focus:border-foreground/50 placeholder-muted-foreground/50 transition-colors" />
              <button onClick={() => { if (endereco.trim()) navigator.clipboard.writeText(endereco) }}
                title="Copiar" className="px-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1">Link Google Maps</label>
            <input type="url" value={mapsLink} onChange={e => setMapsLink(e.target.value)}
              placeholder="https://maps.google.com/..."
              className="w-full bg-muted border border-border text-foreground text-xs rounded-lg px-3 py-1.5 outline-none focus:border-foreground/50 placeholder-muted-foreground/50 transition-colors" />
          </div>

        </div>

        {/* ── ações: Descartar · Visitar · Aprovar (maior) ── */}
        <div className="flex gap-2 p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={discard} disabled={saving}
            className="px-4 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-90 flex-shrink-0"
            style={{ background: 'var(--discard-bg)', color: 'var(--discard-fg)' }}>
            Descartar
          </button>
          <button onClick={visitar} disabled={!canSave}
            className="px-4 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 flex-shrink-0"
            style={{ background: 'color-mix(in srgb, #0ea5e9 18%, var(--card))', color: '#0ea5e9', border: '1px solid color-mix(in srgb, #0ea5e9 40%, transparent)' }}>
            Visitar
          </button>
          <button onClick={approve} disabled={!canSave}
            className="flex-1 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: 'var(--approve-bg)', color: 'var(--approve-fg)' }}>
            {saving ? '…' : 'Aprovar'}
          </button>
        </div>
      </div>

      {zoom && <Lightbox imgs={imgs} startIdx={zoomIdx} title={item.titulo} onClose={() => setZoom(false)} />}
      {matriculaOpen && <MatriculaModal item={item} onClose={() => setMatriculaOpen(false)} />}
    </>
  )
}

// ── StatsPanel — painel direito com resumo da fila ─────────────────────────────
function StatsPanel({ items, reviewItem }: { items: Imovel[]; reviewItem: Imovel | null }) {
  const byPortal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of items) m[it.portal] = (m[it.portal] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [items])

  const totalProp = useMemo(() => items.filter(i => classifyAnunciante(i) === 'proprietario').length, [items])
  const totalPistas = useMemo(() => items.filter(i => i.pistas_ia && Object.keys(i.pistas_ia).length > 0).length, [items])
  const score = reviewItem ? addressScore(reviewItem) : 0
  const pistas = reviewItem ? (reviewItem.pistas_ia ?? {}) as Record<string, unknown> : {}

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* total */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <p className="text-[28px] font-extrabold font-display tabular text-foreground leading-none">{items.length}</p>
        <p className="eyebrow text-muted-foreground mt-1">Pendentes na fila</p>
      </div>

      {/* por portal */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <p className="eyebrow text-muted-foreground/50 mb-2">Por Portal</p>
        <div className="flex flex-col gap-1.5">
          {byPortal.map(([portal, count]) => (
            <div key={portal} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-16 truncate">{portalLabel(portal)}</span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all" style={{ background: 'var(--foreground)', width: `${Math.round((count / Math.max(1, items.length)) * 100)}%` }} />
              </div>
              <span className="text-[10px] font-mono font-bold text-foreground w-5 text-right tabular">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* mini-stats */}
      <div className="px-4 py-3 flex-shrink-0 grid grid-cols-2 gap-2" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="rounded-lg p-2.5" style={{ background: 'var(--secondary)' }}>
          <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wide">Proprietários</p>
          <p className="text-lg font-bold text-foreground tabular mt-0.5">{totalProp}</p>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: 'var(--secondary)' }}>
          <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wide">Com pistas</p>
          <p className="text-lg font-bold text-foreground tabular mt-0.5">{totalPistas}</p>
        </div>
      </div>

      {/* score do imóvel selecionado */}
      {reviewItem && (
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <p className="eyebrow text-muted-foreground/50 mb-2">Score de Endereço</p>
          <div className="flex items-center gap-1.5 mb-2">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <div key={s} className="h-1.5 flex-1 rounded-full transition-all"
                style={{ background: score >= s ? '#f59e0b' : 'var(--border)' }} />
            ))}
            <span className="text-[10px] font-mono font-bold text-amber-500 ml-1">{score}/6</span>
          </div>
          {(['quadra', 'conjunto', 'casa_lote'] as const).filter(k => pistas[k]).map(k => (
            <div key={k} className="flex items-baseline gap-2 mb-1">
              <span className="text-[9px] text-amber-500 uppercase font-mono w-14 flex-shrink-0">{k}</span>
              <span className="text-[11px] text-foreground font-medium">{String(pistas[k])}</span>
            </div>
          ))}
        </div>
      )}

      {!reviewItem && (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-[11px] text-muted-foreground text-center">Selecione um imóvel para ver detalhes aqui.</p>
        </div>
      )}
    </div>
  )
}

// ── ImovelCard ─────────────────────────────────────────────────────────────────
function ImovelCard({ item, fsbo, dups, onReview, selected }: {
  item: Imovel
  fsbo: string
  dups: string[]
  onReview: (item: Imovel) => void
  selected?: boolean
}) {
  const imgs = allImgs(item.imagens)
  const preco = parsePreco(item.preco)
  const hasPistas = !!(
    (item.pistas_ia as Record<string, unknown> | null)?.quadra ||
    (item.pistas_ia as Record<string, unknown> | null)?.conjunto ||
    (item.pistas_ia as Record<string, unknown> | null)?.casa_lote
  )

  return (
    <div
      className={`bg-card border rounded-lg overflow-hidden flex shadow-sm transition-all cursor-pointer hover:border-foreground/20 hover:shadow-md ${
        selected ? 'border-foreground/40 ring-1 ring-foreground/20' : hasPistas ? 'border-amber-300/60' : 'border-border'
      }`}
      onClick={() => onReview(item)}
    >
      {hasPistas && <div className="w-1 bg-amber-400 flex-shrink-0" />}

      <div className="w-28 flex-shrink-0 bg-muted relative">
        {imgs.length > 0 ? (
          <>
            <img src={imgs[0]} alt="" className="w-full h-full object-cover"
              referrerPolicy="no-referrer" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            {imgs.length > 1 && (
              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded font-mono">
                {imgs.length}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 min-h-[5.5rem]">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-medium text-sm truncate">{item.titulo || '(sem título)'}</p>
            <p className="text-muted-foreground text-xs truncate">{item.bairro}{item.cidade ? `, ${item.cidade}` : ''}</p>
            {dups.length > 0 && (
              <p className="text-[10px] text-amber-600 mt-0.5">Também em {dups.map(portalLabel).join(', ')}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            {fsbo === 'proprietario' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#B5E2C7', color: '#008412' }}>Prop.</span>
            )}
            {hasPistas && (
              <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">IA</span>
            )}
            <PortalBadge portal={item.portal} />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="font-bold text-sm" style={{ color: 'var(--approve-fg)' }}>{preco ? fmtBRL(preco) : item.preco || '—'}</span>
          {item.area_m2 && <span className="text-muted-foreground text-xs">{item.area_m2}m²</span>}
          {item.quartos && <span className="text-muted-foreground text-xs">{item.quartos} qtos</span>}
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">{timeAgo(item.coletado_em)}</span>
        </div>
      </div>
    </div>
  )
}

// ── TriagemClient ──────────────────────────────────────────────────────────────
export function TriagemClient() {
  const { toasts, toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const q = (searchParams.get('q') ?? '').toLowerCase().trim()
  const [items, setItems] = useState<Imovel[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [reviewItem, setReviewItem] = useState<Imovel | null>(null)
  const highlightDone = useRef(false)

  const [filterPortal, setFilterPortal] = useState('Todos')
  const [filterPrecoMin, setFilterPrecoMin] = useState(0)
  const [filterHoje, setFilterHoje] = useState(false)
  const [sort, setSort] = useState('endereco')
  const [filterPublicacao, setFilterPublicacao] = useState(0)
  const [filterTipo, setFilterTipo] = useState('Todos')
  const [filterBairro, setFilterBairro] = useState('Todos')
  const [filterProprietario, setFilterProprietario] = useState(false)
  const [filterNovos, setFilterNovos] = useState(() => searchParams.get('novos') === '1')
  const [lastSeen] = useState(() => localStorage.getItem('triagem_last_seen') ?? new Date(0).toISOString())

  // Abre automaticamente o imóvel quando vindo de link de e-mail (?highlight=<link>)
  useEffect(() => {
    if (loading || !items.length || highlightDone.current) return
    const highlight = new URLSearchParams(window.location.search).get('highlight')
    if (!highlight) return
    const found = items.find(i => i.link === highlight)
    if (found) { setReviewItem(found); highlightDone.current = true }
  }, [loading, items])

  // Volta à primeira página quando a busca global (?q=) muda
  useEffect(() => { setPage(1) }, [q])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const cutoff = daysAgo(30)
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('imoveis_todos')
          .select('link,titulo,preco,bairro,cidade,area_m2,quartos,descricao,imagens,coletado_em,data_publicacao,pistas_ia,tipo_imovel,creci,nome_anunciante,tipo_anunciante,portal')
          .eq('status_triagem', 'pendente')
          .neq('creci', '22784')
          .gte('coletado_em', cutoff)
          .order('coletado_em', { ascending: false })
          .range(from, to)
      )
      setItems(rows)
      setLoading(false)
    }
    load()
  }, [supabase])

  const bairros = useMemo(() => {
    const set = new Set(items.map(i => getRegiao(i)).filter(Boolean))
    return ['Todos', ...[...set].sort()]
  }, [items])

  const tiposImovel = useMemo(() => {
    const set = new Set(items.map(i => i.tipo_imovel).filter(Boolean))
    return ['Todos', ...[...set].sort()]
  }, [items])

  const portaisPresentes = useMemo(() => {
    const set = new Set(items.map(i => i.portal).filter(Boolean))
    return [...set].sort()
  }, [items])

  const dupMap = useMemo(() => {
    const m = new Map<string, Imovel[]>()
    for (const it of items) {
      const k = dedupKey(it)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return m
  }, [items])

  const dupPortals = (item: Imovel) => {
    const k = dedupKey(item)
    if (!k) return []
    const group = dupMap.get(k) ?? []
    return [...new Set(group.map(g => g.portal))].filter(p => p !== item.portal)
  }

  const filtered = useMemo(() => {
    const todayCutoff = startOfToday()
    const pubCutoff = filterPublicacao > 0
      ? new Date(Date.now() - filterPublicacao * 86400000).toISOString().slice(0, 10)
      : null
    const list = items.filter(item => {
      if (q) {
        const hay = `${item.titulo ?? ''} ${item.bairro ?? ''} ${item.cidade ?? ''} ${item.nome_anunciante ?? ''} ${item.tipo_imovel ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterPortal !== 'Todos' && item.portal !== filterPortal) return false
      if (filterPrecoMin > 0 && parsePreco(item.preco) < filterPrecoMin) return false
      if (filterHoje && (item.coletado_em ?? '') < todayCutoff) return false
      if (pubCutoff && (!item.data_publicacao || item.data_publicacao < pubCutoff)) return false
      if (filterTipo !== 'Todos' && item.tipo_imovel !== filterTipo) return false
      if (filterBairro !== 'Todos' && getRegiao(item) !== filterBairro) return false
      if (filterProprietario && classifyAnunciante(item) !== 'proprietario') return false
      if (filterNovos && (item.coletado_em ?? '') <= lastSeen) return false
      return true
    })
    if (sort === 'endereco') list.sort((a, b) => addressScore(b) - addressScore(a))
    else if (sort === 'preco') list.sort((a, b) => parsePreco(b.preco) - parsePreco(a.preco))
    else if (sort === 'publicacao') list.sort((a, b) => (b.data_publicacao ?? '').localeCompare(a.data_publicacao ?? ''))
    else if (sort === 'coleta') list.sort((a, b) => (b.coletado_em ?? '').localeCompare(a.coletado_em ?? ''))
    return list
  }, [items, q, filterPortal, filterPrecoMin, filterHoje, filterPublicacao, filterTipo, filterBairro, filterProprietario, filterNovos, lastSeen, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const updateStatus = async (item: Imovel, status: string, extra: Record<string, unknown> = {}) => {
    const table = portalTable(item.portal)
    let geoFields: Record<string, unknown> = {}
    if (['aprovado', 'para_visitar'].includes(status) && extra.maps_link) {
      const parsed = parseLatLng(extra.maps_link as string)
      if (parsed) geoFields = { lat: parsed.lat, lng: parsed.lng, geocoded_em: new Date().toISOString() }
    }
    const { error } = await supabase.from(table)
      .update({ status_triagem: status, ...extra, ...geoFields })
      .eq('link', item.link)
    if (error) { toast(`Erro ao atualizar: ${error.message}`, 'error'); return false }
    setItems(prev => prev.filter(i => i.link !== item.link))
    const msg = { aprovado: 'Imóvel aprovado', para_visitar: 'Enviado para visitas', descartado: 'Imóvel descartado' }[status] ?? 'Atualizado'
    toast(msg, status === 'descartado' ? 'info' : 'success')
    if (pageItems.length === 1 && page > 1) setPage(p => p - 1)
    return true
  }

  const handleApprove = async (item: Imovel, data: { endereco: string; mapsLink: string }) => {
    const ok = await updateStatus(item, 'aprovado', { endereco: data.endereco || null, maps_link: data.mapsLink || null })
    if (ok) setReviewItem(null)
  }
  const handleVisitar = async (item: Imovel, data: { endereco: string; mapsLink: string }) => {
    const ok = await updateStatus(item, 'para_visitar', { endereco: data.endereco || null, maps_link: data.mapsLink || null })
    if (ok) setReviewItem(null)
  }
  const handleDiscard = async (item: Imovel) => {
    const ok = await updateStatus(item, 'descartado')
    if (ok) setReviewItem(null)
  }

  const selectClass = "bg-card border border-border text-xs text-foreground rounded-lg px-2.5 py-1.5 outline-none focus:border-foreground/50"

  return (
    <div className="flex overflow-hidden h-full"
      style={{ minHeight: 0 }}>

      {/* ── LISTA (esquerda) ──────────────────────────────────── */}
      <div className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>

        {/* Cabeçalho da lista */}
        <div className="px-4 py-2 flex-shrink-0 flex items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
          <p className="text-[11px] text-muted-foreground font-mono">
            {filtered.length} imóveis{q && <> · &quot;{q}&quot;</>}
          </p>
        </div>

        {/* Filtros compactos */}
        <div className="px-4 py-2 flex-shrink-0 flex flex-wrap gap-2 items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
          <select value={filterPortal} onChange={e => { setFilterPortal(e.target.value); setPage(1) }} className={selectClass}>
            <option value="Todos">Portal: todos</option>
            {portaisPresentes.map(p => <option key={p} value={p}>{portalLabel(p)}</option>)}
          </select>
          <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1) }} className={selectClass}>
            <option value="Todos">Tipo: todos</option>
            {tiposImovel.filter(v => v !== 'Todos').map(v => <option key={v}>{v}</option>)}
          </select>
          <select value={filterBairro} onChange={e => { setFilterBairro(e.target.value); setPage(1) }} className={selectClass}>
            <option value="Todos">Região: todas</option>
            {bairros.filter(v => v !== 'Todos').map(v => <option key={v}>{v}</option>)}
          </select>
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }} className={selectClass}>
            <option value="endereco">Endereço</option>
            <option value="preco">Maior preço</option>
            <option value="publicacao">Publicação</option>
            <option value="coleta">Coleta</option>
          </select>
          <div className="flex gap-1">
            {[{ label: 'Todos', val: 0 }, { label: '1d', val: 1 }, { label: '3d', val: 3 }, { label: '7d', val: 7 }].map(({ label, val }) => (
              <button key={val} onClick={() => { setFilterPublicacao(val); setPage(1) }}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  filterPublicacao === val
                    ? 'bg-foreground border-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <input type="checkbox" checked={filterProprietario} onChange={e => { setFilterProprietario(e.target.checked); setPage(1) }} className="w-3 h-3" />
            Proprietários
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <input type="checkbox" checked={filterHoje} onChange={e => { setFilterHoje(e.target.checked); setPage(1) }} className="w-3 h-3" />
            Hoje
          </label>
          <button
            onClick={() => { setFilterNovos(n => !n); setPage(1) }}
            className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
              filterNovos
                ? 'bg-foreground border-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Novos
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg animate-pulse bg-muted border border-border" />
              ))}
            </div>
          ) : pageItems.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="font-medium text-foreground text-sm">Fila vazia</p>
              <p className="text-xs mt-1">Sem imóveis pendentes com esses filtros.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pageItems.map(item => (
                <ImovelCard
                  key={`${item.portal}-${item.link}`}
                  item={item}
                  fsbo={classifyAnunciante(item)}
                  dups={dupPortals(item)}
                  selected={reviewItem?.link === item.link}
                  onReview={it => setReviewItem(it)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Anterior
            </button>
            <span className="text-xs text-muted-foreground tabular">{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* ── DETALHE (centro) ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ background: 'var(--card)' }}>
        {reviewItem ? (
          <ReviewPanel
            item={reviewItem}
            onApprove={handleApprove}
            onVisitar={handleVisitar}
            onDiscard={handleDiscard}
            onClose={() => setReviewItem(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <svg className="w-10 h-10 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-foreground">Selecione um imóvel</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em &quot;Revisar&quot; ou na foto de um card para ver os detalhes aqui.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── STATS (direita) ──────────────────────────────────── */}
      <div
        className="w-[240px] flex-shrink-0 flex flex-col overflow-hidden"
        style={{ borderLeft: '1px solid var(--sidebar-border)', background: 'var(--sidebar)' }}
      >
        <StatsPanel items={items} reviewItem={reviewItem} />
      </div>

      <ToastStack toasts={toasts} />
    </div>
  )
}
