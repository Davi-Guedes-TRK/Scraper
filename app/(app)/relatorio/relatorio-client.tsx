'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { parsePreco, fmtBRL, classifyAnunciante } from '@/lib/formatters'
import { portalTable } from '@/lib/portals'
import { PortalBadge } from '@/components/portal-badge'
import { oficioFor, type Oficio } from '@/lib/oficios'
import { parseCartorioEntries, scoreAddress } from '@/lib/cartorio'

type Pistas = { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null }

type Imovel = {
  link: string
  portal: string
  titulo?: string | null
  bairro?: string | null
  cidade?: string | null
  preco?: string | null
  coletado_em?: string | null
  descricao?: string | null
  pistas_ia?: Pistas | null
  status_solicitacao?: string | null
  endereco?: string | null
  maps_link?: string | null
  visitado_em?: string | null
  nome_anunciante?: string | null
  telefone?: string | null
  tipo_anunciante?: string | null
  tipo_imovel?: string | null
  creci?: string | null
  numero_matricula?: string | null
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

// ── StatusBadge ────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pendente:  { label: 'Pendente',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  enviado:   { label: 'Enviado',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  recebido:  { label: 'Recebido',   cls: 'bg-green-50 text-green-700 border-green-200' },
  completo:  { label: 'Completo',   cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = STATUS_MAP[status ?? ''] ?? { label: status ?? '—', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatEndereco(item: Imovel): string {
  if (item.endereco) return item.endereco
  if (item.pistas_ia) {
    const p = item.pistas_ia
    const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean) as string[]
    if (parts.length) return parts.join(', ')
  }
  return item.bairro || item.titulo || '—'
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR')
}

// ── EditEnderecoModal ──────────────────────────────────────────────────────────
function EditEnderecoModal({ item, current, onSave, onClose }: {
  item: Imovel
  current: string
  onSave: (item: Imovel, newEndereco: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim() || value.trim() === current) { onClose(); return }
    setSaving(true)
    await onSave(item, value.trim())
    setSaving(false)
  }

  return (
    <div role="button" tabIndex={0} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="bg-white border border-[#d0d7de] rounded-lg w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#d0d7de]">
          <h2 className="text-[#1f2328] font-semibold text-base">Editar endereço</h2>
        </div>
        <div className="p-5">
          <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} autoFocus
            className="w-full bg-[#f6f8fa] border border-[#d0d7de] text-[#1f2328] text-sm rounded-lg px-4 py-3 outline-none focus:border-trk-blue transition-colors resize-none" />
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[#d0d7de]">
          <button onClick={onClose}
            className="flex-1 text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d0d7de] hover:border-[#8c959f] px-4 py-2.5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={saving || !value.trim()}
            className="flex-1 text-sm font-semibold text-white bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── TratarRespostaModal — cola a resposta do cartório e casa endereço→matrícula ──
function TratarRespostaModal({ candidatos, onSalvar, onClose }: {
  candidatos: Imovel[]
  onSalvar: (pares: Array<{ item: Imovel; matricula: string }>) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [ignorar, setIgnorar] = useState<Set<number>>(new Set())

  // Para cada "endereço - matrícula" colado, acha o imóvel enviado de maior score.
  const matches = useMemo(() =>
    parseCartorioEntries(text).map(e => {
      let best: Imovel | null = null, bestScore = 0
      for (const c of candidatos) {
        const s = scoreAddress(e.address, formatEndereco(c))
        if (s > bestScore) { bestScore = s; best = c }
      }
      return { address: e.address, matricula: e.matricula, item: bestScore > 0 ? best : null }
    }), [text, candidatos])

  const aplicaveis = matches
    .map((m, i) => ({ ...m, i }))
    .filter(m => m.item && !ignorar.has(m.i))

  const salvar = async () => {
    if (!aplicaveis.length || saving) return
    setSaving(true)
    await onSalvar(aplicaveis.map(m => ({ item: m.item!, matricula: m.matricula })))
    setSaving(false)
    onClose()
  }

  return (
    <div role="button" tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-foreground text-sm">Tratar resposta do cartório</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cole a resposta (cada linha no formato “endereço - matrícula”). O sistema casa com os {candidatos.length} imóveis aguardando.
          </p>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5} autoFocus
            placeholder={'Ex.:\nSQN 312 Bloco B Apto 204 - 123456\nSHIS QI 5 Conjunto 8 Casa 12 - 98765'}
            className="w-full rounded-lg px-4 py-3 text-sm text-foreground outline-none focus:ring-2 ring-foreground/20 transition-all resize-none"
            style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }} />

          {matches.length > 0 && (
            <div className="rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto" style={{ border: '1px solid var(--border)' }}>
              {matches.map((m, i) => {
                const off = ignorar.has(i)
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-[12px]"
                    style={{ borderBottom: '1px solid var(--border)', opacity: off || !m.item ? 0.5 : 1 }}>
                    <span className="font-mono shrink-0 text-foreground">{m.matricula}</span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <span className="flex-1 min-w-0 truncate text-foreground">
                      {m.item ? formatEndereco(m.item) : <span className="italic text-muted-foreground">sem correspondência</span>}
                    </span>
                    {m.item && (
                      <button onClick={() => setIgnorar(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}
                        className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        {off ? 'incluir' : 'ignorar'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 text-sm text-muted-foreground hover:text-foreground border border-border px-4 py-2.5 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={salvar} disabled={saving || !aplicaveis.length}
              className="flex-1 text-sm font-semibold text-white bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
              {saving ? 'Salvando…' : `Registrar ${aplicaveis.length} matrícula(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MatriculaModal ─────────────────────────────────────────────────────────────
function MatriculaModal({ item, onSave, onClose }: {
  item: Imovel
  onSave: (item: Imovel, matricula: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(item.numero_matricula && item.numero_matricula !== 'N/A' ? item.numero_matricula : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    await onSave(item, value.trim())
    setSaving(false)
  }

  return (
    <div role="button" tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="rounded-xl w-full max-w-sm shadow-2xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-semibold text-foreground text-sm">{formatEndereco(item)}</p>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
            placeholder="Número da matrícula"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="w-full rounded-lg px-4 py-3 text-lg font-mono text-foreground outline-none focus:ring-2 ring-foreground/20 transition-all"
            style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
          />
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 text-sm text-muted-foreground hover:text-foreground border border-border px-4 py-2.5 rounded-lg transition-colors">
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !value.trim()}
              className="flex-1 text-sm font-semibold text-white bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── RelatorioClient ────────────────────────────────────────────────────────────
// ── ActionsMenu — agrupa as ações secundárias num menu (limpa a topbar) ──────────
function ActionsMenu({ items }: { items: Array<{ label: string; onClick: () => void; disabled?: boolean; danger?: boolean }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="text-sm font-medium px-4 py-2 rounded-lg border border-[#d0d7de] text-[#1f2328] hover:border-[#8c959f] transition-colors flex items-center gap-1.5">
        Ações
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-56 rounded-lg border border-[#d0d7de] bg-white shadow-lg py-1 overflow-hidden">
            {items.map(it => (
              <button key={it.label} disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick() }}
                className={`w-full text-left px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${it.danger ? 'text-red-600 hover:bg-red-50' : 'text-[#1f2328] hover:bg-[#f6f8fa]'}`}>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Envio por Ofício (organiza as matrículas pelos cartórios do DF — lib/oficios.ts) ──
const CANAL_INFO: Record<string, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'var(--success)' },
  email:    { label: 'E-mail',   color: 'var(--chart-1)' },
  telefone: { label: 'Telefone', color: 'var(--chart-2)' },
}
const temMatricula = (it: Imovel) => !!it.numero_matricula && it.numero_matricula !== 'N/A' && it.numero_matricula.trim() !== ''

// Mensagem para PEDIR a matrícula (+ ônus) por endereço — é o objetivo da página,
// então NÃO listamos matrícula (não temos ainda); enviamos só os imóveis sem ela.
function buildLinkOficio(oficio: Oficio, pedidos: Imovel[]): string {
  const lista = pedidos.map((it, i) => {
    const maps = it.maps_link ? `\n   ${it.maps_link}` : ''
    return `${i + 1}. ${formatEndereco(it)}${maps}`
  }).join('\n')
  const msg = `Olá! Sou da TRK Imóveis. Gostaria de solicitar o número da matrícula e a certidão de ônus reais dos seguintes imóveis:\n${lista}\n\nDesde já agradeço!`
  if (oficio.canal === 'whatsapp') { const d = oficio.contato.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}?text=${encodeURIComponent(msg)}` }
  if (oficio.canal === 'email') return `mailto:${oficio.contato}?subject=${encodeURIComponent('Solicitação de matrícula e certidão de ônus — TRK Imóveis')}&body=${encodeURIComponent(msg)}`
  return `tel:${oficio.contato.replace(/[^\d+]/g, '')}`
}

function PorOficioView({ items, onEnviar, onTratar }: {
  items: Imovel[]
  onEnviar: (links: string[]) => void
  onTratar: (candidatos: Imovel[]) => void
}) {
  const [enviandoEmail, setEnviandoEmail] = useState<string | null>(null) // nome do ofício sendo enviado

  const grupos = useMemo(() => {
    const map = new Map<string, { oficio: Oficio | null; items: Imovel[] }>()
    for (const it of items) {
      const of = oficioFor(it.cidade)
      const key = of?.nome ?? '__sem__'
      if (!map.has(key)) map.set(key, { oficio: of, items: [] })
      map.get(key)!.items.push(it)
    }
    return Array.from(map.values()).sort((a, b) => (a.oficio?.nome ?? 'zzz').localeCompare(b.oficio?.nome ?? 'zzz'))
  }, [items])

  const enviarEmail = async (of: Oficio, pedidos: Imovel[]) => {
    setEnviandoEmail(of.nome)
    try {
      const res = await fetch('/api/cartorio/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: pedidos.map(p => p.link) }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.totalEnviado > 0) {
        onEnviar(pedidos.map(p => p.link))
      }
    } finally {
      setEnviandoEmail(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {grupos.map(g => {
        const of = g.oficio
        // sem matrícula e não desistidos = o que precisamos PEDIR ao cartório
        const aSolicitar = g.items.filter(it => !temMatricula(it) && it.numero_matricula !== 'N/A')
        const recebidas = g.items.filter(temMatricula)
        const link = of && aSolicitar.length ? buildLinkOficio(of, aSolicitar) : null
        const canal = of ? CANAL_INFO[of.canal] : null
        return (
          <div key={of?.nome ?? 'sem'} className="card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${canal?.color ?? 'var(--border)'}`, background: 'var(--secondary)' }}>
              <div className="min-w-0">
                <span className="text-[13px] font-semibold text-foreground">{of?.nome ?? 'Ofício não identificado'}</span>
                {of && canal
                  ? <span className="text-[11px] text-muted-foreground ml-2">{canal.label} · {of.contato}</span>
                  : <span className="text-[11px] text-muted-foreground ml-2">região fora da lista — defina o ofício manualmente</span>}
              </div>
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{g.items.length} imóveis · {aSolicitar.length} a solicitar · {recebidas.length} c/ matrícula</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {g.items.map(it => (
                <div key={`${it.portal}-${it.link}`} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                  <span className="flex-1 min-w-0 truncate text-foreground">{formatEndereco(it)}</span>
                  {temMatricula(it)
                    ? <span className="font-mono text-foreground shrink-0">mat. {it.numero_matricula}</span>
                    : it.numero_matricula === 'N/A'
                      ? <span className="text-muted-foreground shrink-0 italic">desistimos</span>
                      : <span className="text-muted-foreground shrink-0 italic">aguardando matrícula</span>}
                  <span className="shrink-0"><StatusBadge status={it.status_solicitacao} /></span>
                </div>
              ))}
            </div>
            {of && (
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                {!aSolicitar.length
                  ? <span className="text-[11px] text-muted-foreground">nada a solicitar — todas com matrícula</span>
                  : of.canal === 'email'
                    ? (
                      // E-mail: envia de verdade via Resend (1 clique, sem abrir cliente)
                      <button
                        disabled={enviandoEmail === of.nome}
                        onClick={() => enviarEmail(of, aSolicitar)}
                        className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5 transition-opacity hover:opacity-85 disabled:opacity-50"
                        style={{ background: canal!.color }}>
                        {enviandoEmail === of.nome
                          ? <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" /><path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Enviando…</>
                          : `Enviar e-mail (${aSolicitar.length})`}
                      </button>
                    )
                    : (
                      // WhatsApp / telefone: abre o canal pré-preenchido manualmente
                      <a href={link!} target="_blank" rel="noreferrer"
                        onClick={() => onEnviar(aSolicitar.map(p => p.link))}
                        className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white flex items-center transition-opacity hover:opacity-85"
                        style={{ background: canal!.color }}>
                        Solicitar {aSolicitar.length} via {canal!.label}
                      </a>
                    )
                }
                {aSolicitar.length > 0 && (
                  <button onClick={() => onTratar(aSolicitar)} className="h-8 px-3 rounded-lg text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ border: '1px solid var(--border)' }}>
                    Tratar resposta
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── RelatorioClient ────────────────────────────────────────────────────────────
export function RelatorioClient() {
  const { toasts, toast } = useToast()
  const [items, setItems] = useState<Imovel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [whatsappText, setWhatsappText] = useState('')
  const [editItem, setEditItem] = useState<Imovel | null>(null)
  const [matriculaItem, setMatriculaItem] = useState<Imovel | null>(null)
  const [tratarCand, setTratarCand] = useState<Imovel[] | null>(null)
  const [pipefyLog, setPipefyLog] = useState<string | null>(null)
  const [pipefyRunning, setPipefyRunning] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<'lista' | 'oficio'>('oficio')

  // Imóveis aguardando matrícula (sem número e não desistidos) — candidatos a "tratar resposta".
  const aguardando = useMemo(
    () => items
      .filter(i => !temMatricula(i) && i.numero_matricula !== 'N/A')
      .sort((a, b) => new Date(b.coletado_em ?? 0).getTime() - new Date(a.coletado_em ?? 0).getTime()),
    [items],
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/relatorio')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setItems(await res.json())
      } catch (err) {
        toast(`Erro ao carregar: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleSelect = (link: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(link) ? next.delete(link) : next.add(link)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map(i => i.link)))
  }

  const markLinks = async (links: string[], status: string): Promise<boolean> => {
    if (!links.length) return false
    const set = new Set(links)
    const byPortal: Record<string, string[]> = {}
    items.filter(i => set.has(i.link)).forEach(i => { (byPortal[i.portal] ??= []).push(i.link) })
    try {
      const res = await fetch('/api/relatorio', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status_solicitacao', byPortal, status }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(`Erro: ${d.error ?? res.status}`, 'error'); return false }
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error'); return false
    }
    setItems(prev => prev.map(i => set.has(i.link) ? { ...i, status_solicitacao: status } : i))
    return true
  }

  const markSelected = async (status: string) => {
    if (!selected.size) { toast('Selecione ao menos um imóvel.', 'info'); return }
    const count = selected.size
    if (await markLinks([...selected], status)) { setSelected(new Set()); toast(`${count} imóveis atualizados`, 'success') }
  }

  const generateWhatsApp = () => {
    const sel = items.filter(i => selected.has(i.link))
    if (!sel.length) { toast('Selecione ao menos um imóvel.', 'info'); return }
    const lines = sel.map((item, idx) => {
      const end = formatEndereco(item)
      const maps = item.maps_link ? `\n   ${item.maps_link}` : ''
      return `${idx + 1}. ${end}${maps}`
    })
    setWhatsappText(`Boa tarde! Solicito matrícula e certidão de ônus reais dos seguintes imóveis:\n\n${lines.join('\n\n')}`)
  }

  const exportExcel = () => {
    const rows = selected.size ? items.filter(i => selected.has(i.link)) : items
    if (!rows.length) { toast('Nada para exportar.', 'info'); return }
    const hoje = new Date().toLocaleDateString('pt-BR')
    const headers = [
      'Bairro', 'Localização', 'Endereço do Imóvel', 'Links de anúncio', 'Matrícula',
      'Valor de anúncio', 'Nome do Proprietário', 'Idade', 'Renda', 'Telefone de Contato',
      'Outros contatos', 'E-mail', 'Início do levantamento', 'Tipo de Imóvel',
    ]
    const data = rows.map(item => {
      const part = classifyAnunciante(item) === 'proprietario'
      const tel = item.telefone ?? ''
      return {
        'Bairro': item.bairro ?? '',
        'Localização': item.maps_link ?? '',
        'Endereço do Imóvel': formatEndereco(item),
        'Links de anúncio': item.link ?? '',
        'Matrícula': item.numero_matricula ?? '',
        'Valor de anúncio': parsePreco(item.preco) ? fmtBRL(parsePreco(item.preco)) : item.preco ?? '',
        'Nome do Proprietário': part ? (item.nome_anunciante ?? '') : '',
        'Idade': '',
        'Renda': '',
        'Telefone de Contato': part ? tel : '',
        'Outros contatos': !part ? tel : '',
        'E-mail': '',
        'Início do levantamento': hoje,
        'Tipo de Imóvel': item.tipo_imovel ?? '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(data, { header: headers })
    ws['!cols'] = [
      { wch: 16 }, { wch: 30 }, { wch: 42 }, { wch: 34 }, { wch: 14 },
      { wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 12 }, { wch: 20 },
      { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cartório')
    XLSX.writeFile(wb, `cartorio_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast(`Excel gerado (${rows.length} imóveis)`, 'success')
  }

  const copyText = () => {
    navigator.clipboard.writeText(whatsappText).then(() => {
      setCopied(true)
      toast('Texto copiado!', 'success')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const saveMatricula = async (item: Imovel, matricula: string) => {
    try {
      const res = await fetch('/api/relatorio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'matricula', link: item.link, portal: item.portal, numero_matricula: matricula }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast(`Erro: ${d.error ?? res.status}`, 'error')
        return
      }
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
      return
    }
    setItems(prev => prev.map(i => i.link === item.link ? { ...i, numero_matricula: matricula } : i))
    setMatriculaItem(null)
    toast('Matrícula salva', 'success')
  }

  // Registra em lote as matrículas casadas a partir da resposta colada do cartório.
  // A API já marca status_solicitacao='recebido' ao gravar uma matrícula real.
  const handleTratarSalvar = async (pares: Array<{ item: Imovel; matricula: string }>) => {
    let ok = 0
    for (const { item, matricula } of pares) {
      try {
        const res = await fetch('/api/relatorio', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'matricula', link: item.link, portal: item.portal, numero_matricula: matricula }),
        })
        if (res.ok) {
          ok++
          setItems(prev => prev.map(i => i.link === item.link ? { ...i, numero_matricula: matricula, status_solicitacao: 'recebido' } : i))
        }
      } catch { /* ignora item com erro, segue o lote */ }
    }
    toast(`${ok} matrícula(s) registrada(s)`, ok ? 'success' : 'error')
  }

  const saveEndereco = async (item: Imovel, newEndereco: string) => {
    try {
      const res = await fetch('/api/relatorio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'endereco', link: item.link, portal: item.portal, endereco: newEndereco }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast(`Erro: ${d.error ?? res.status}`, 'error')
        return
      }
    } catch (err) {
      toast(`Erro: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
      return
    }
    setItems(prev => prev.map(i => i.link === item.link ? { ...i, endereco: newEndereco } : i))
    setEditItem(null)
    toast('Endereço atualizado', 'success')
  }

  // Roda o preenchedor do Pipefy (preview, não envia) via /api/pipefy/preencher e mostra o log
  const testarPipefy = async () => {
    setPipefyRunning(true)
    setPipefyLog('Rodando preenchimento (preview, não envia)…\n\nAbrindo o form "SEC | Ônus" com a sessão salva e preenchendo tudo menos os 2 campos NIDO.')
    try {
      const res = await fetch('/api/pipefy/preencher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview' }),
      })
      const d = await res.json().catch(() => ({}))
      setPipefyLog(d.log || d.error || `HTTP ${res.status}`)
      if (!res.ok) toast(`Falha no preenchimento: ${d.error ?? res.status}`, 'error')
      else toast('Preview concluído — veja o log', 'success')
    } catch (err) {
      setPipefyLog(`Erro ao chamar o preenchedor: ${err instanceof Error ? err.message : 'desconhecido'}`)
      toast('Erro ao chamar o preenchedor', 'error')
    } finally {
      setPipefyRunning(false)
    }
  }

  // Descarta (soft: status_triagem='descartado') os selecionados — saem do relatório, reversível pela Triagem
  const confirmDelete = async () => {
    if (!selected.size) return
    setDeleting(true)
    const byPortal: Record<string, string[]> = {}
    items.filter(i => selected.has(i.link)).forEach(i => {
      if (!byPortal[i.portal]) byPortal[i.portal] = []
      byPortal[i.portal].push(i.link)
    })
    try {
      const res = await fetch('/api/relatorio', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byPortal }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(`Erro ao descartar: ${d.error ?? res.status}`, 'error'); return }
      const n = selected.size
      setItems(prev => prev.filter(i => !selected.has(i.link)))
      setSelected(new Set())
      setDeleteOpen(false)
      toast(`${n} imóvel${n !== 1 ? 'is' : ''} descartado${n !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      toast(`Erro ao descartar: ${err instanceof Error ? err.message : 'desconhecido'}`, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const btn = 'text-sm font-medium px-4 py-2 rounded-lg transition-colors'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2328]">Relatório para Cartório</h1>
          <p className="text-[#656d76] text-sm mt-1">Imóveis aprovados e visitados · solicitação de matrícula e ônus reais</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['lista', 'Lista'], ['oficio', 'Por Ofício']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} className="px-3 py-2 text-sm font-medium transition-colors"
                style={view === v ? { background: 'var(--chart-1)', color: '#fff' } : { color: 'var(--muted-foreground)' }}>
                {label}
              </button>
            ))}
          </div>
          <ActionsMenu
            items={[
              { label: aguardando.length ? `Tratar resposta do cartório (${aguardando.length})` : 'Tratar resposta do cartório', onClick: () => setTratarCand(aguardando), disabled: !aguardando.length },
              { label: pipefyRunning ? 'Testando Pipefy…' : 'Testar Pipefy (preview)', onClick: testarPipefy, disabled: pipefyRunning },
              { label: 'Exportar Excel', onClick: exportExcel },
              { label: 'Gerar texto WhatsApp', onClick: generateWhatsApp },
              { label: 'Descartar selecionados', onClick: () => setDeleteOpen(true), disabled: !selected.size, danger: true },
            ]}
          />
          <button onClick={() => markSelected('enviado')} disabled={!selected.size}
            className={`${btn} bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed text-white`}>
            Marcar enviado{selected.size ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>

      {whatsappText && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-green-800">Texto para WhatsApp</span>
            <button onClick={copyText}
              className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
          <pre className="text-sm text-green-900 whitespace-pre-wrap font-sans">{whatsappText}</pre>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse bg-[#f6f8fa] border border-[#d0d7de]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-[#656d76]">
          <p className="font-medium text-[#1f2328] text-lg">Nenhum imóvel para cartório</p>
          <p className="text-sm mt-1">Aprove (endereço completo) ou marque como visitado na Triagem/Visitas.</p>
        </div>
      ) : view === 'oficio' ? (
        <PorOficioView
          items={items}
          onEnviar={async (links) => { if (await markLinks(links, 'enviado')) toast(`${links.length} marcado(s) como enviado`, 'success') }}
          onTratar={(cand) => setTratarCand(cand)}
        />
      ) : (
        <div className="bg-white border border-[#d0d7de] rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#d0d7de] text-xs text-[#656d76] bg-[#f6f8fa]">
                <th className="px-4 py-2.5 text-left w-8">
                  <input type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="accent-trk-blue" />
                </th>
                <th className="px-4 py-2.5 text-left">Endereço</th>
                <th className="px-4 py-2.5 text-left">Maps</th>
                <th className="px-4 py-2.5 text-left">Portal</th>
                <th className="px-4 py-2.5 text-left">Valor</th>
                <th className="px-4 py-2.5 text-left">Data</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Matrícula</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={`${item.portal}-${item.link}`}
                  onClick={() => toggleSelect(item.link)}
                  className={`border-b border-[#d0d7de] transition-colors cursor-pointer ${
                    selected.has(item.link) ? 'bg-[#ddf4ff]' : 'hover:bg-[#f6f8fa]'
                  }`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={selected.has(item.link)}
                      onChange={() => toggleSelect(item.link)}
                      onClick={e => e.stopPropagation()}
                      className="accent-trk-blue" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[#1f2328] font-medium">{formatEndereco(item)}</p>
                        <a href={item.link} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-trk-blue hover:underline text-xs">ver anúncio</a>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setEditItem(item) }}
                        title="Editar endereço"
                        className="text-[#656d76] hover:text-trk-blue p-1 flex-shrink-0 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {item.maps_link ? (
                      <a href={item.maps_link} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center text-xs text-[#656d76] hover:text-[#1f2328] border border-[#d0d7de] hover:border-[#8c959f] px-2 py-1 rounded-lg transition-colors">
                        Maps
                      </a>
                    ) : <span className="text-[#d0d7de] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5"><PortalBadge portal={item.portal} /></td>
                  <td className="px-4 py-2.5 text-green-700 font-semibold">
                    {parsePreco(item.preco) ? fmtBRL(parsePreco(item.preco)) : item.preco || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[#656d76]">{formatDate(item.coletado_em)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={item.status_solicitacao} /></td>
                  <td className="px-4 py-2.5">
                    {item.numero_matricula === 'N/A' ? (
                      <button
                        onClick={e => { e.stopPropagation(); setMatriculaItem(item) }}
                        className="text-xs italic text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar matrícula">
                        desistimos
                      </button>
                    ) : item.numero_matricula ? (
                      <button
                        onClick={e => { e.stopPropagation(); setMatriculaItem(item) }}
                        className="font-mono text-xs font-semibold text-foreground hover:text-trk-blue transition-colors"
                        title="Editar matrícula">
                        {item.numero_matricula}
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setMatriculaItem(item) }}
                        className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 px-2 py-0.5 rounded transition-colors"
                        title="Inserir matrícula">
                        + matrícula
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-[#d0d7de] text-xs text-[#656d76]">
            {items.length} imóveis · {selected.size} selecionados
          </div>
        </div>
      )}

      {editItem && (
        <EditEnderecoModal
          item={editItem}
          current={formatEndereco(editItem)}
          onSave={saveEndereco}
          onClose={() => setEditItem(null)}
        />
      )}
      {matriculaItem && (
        <MatriculaModal
          item={matriculaItem}
          onSave={saveMatricula}
          onClose={() => setMatriculaItem(null)}
        />
      )}
      {tratarCand && (
        <TratarRespostaModal
          candidatos={tratarCand}
          onSalvar={handleTratarSalvar}
          onClose={() => setTratarCand(null)}
        />
      )}
      {pipefyLog !== null && (
        <div role="button" tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { if (!pipefyRunning) setPipefyLog(null) }}
          onKeyDown={e => { if (e.key === 'Escape' && !pipefyRunning) setPipefyLog(null) }}>
          <div className="rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                {pipefyRunning && (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                Log do preenchimento — Pipefy “SEC | Ônus” (preview)
              </p>
              <button onClick={() => setPipefyLog(null)} disabled={pipefyRunning}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors disabled:opacity-40">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap p-4 max-h-[60vh] overflow-auto text-foreground leading-relaxed"
              style={{ background: 'var(--secondary)' }}>{pipefyLog}</pre>
            <div className="px-5 py-2.5 text-[11px] text-muted-foreground" style={{ borderTop: '1px solid var(--border)' }}>
              Preview não envia nada. Para criar os cards de verdade, rode no terminal: <span className="font-mono">python scripts/pipefy_portal_fill.py --from-db --submit</span>
            </div>
          </div>
        </div>
      )}
      {deleteOpen && (
        <div role="button" tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { if (!deleting) setDeleteOpen(false) }}
          onKeyDown={e => { if (e.key === 'Escape' && !deleting) setDeleteOpen(false) }}>
          <div className="bg-white border border-[#d0d7de] rounded-lg w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#d0d7de]">
              <h2 className="text-[#1f2328] font-semibold text-base">Descartar imóveis?</h2>
            </div>
            <div className="p-5 text-sm text-[#656d76]">
              <b className="text-[#1f2328]">{selected.size}</b> imóvel{selected.size !== 1 ? 'is' : ''} sai{selected.size !== 1 ? 'em' : ''} do relatório (status “descartado”). É <b className="text-[#1f2328]">reversível</b> — dá pra reaprovar pela Triagem.
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-[#d0d7de]">
              <button onClick={() => setDeleteOpen(false)} disabled={deleting}
                className="flex-1 text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d0d7de] hover:border-[#8c959f] px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
                {deleting ? 'Descartando…' : `Descartar ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} />
    </div>
  )
}
