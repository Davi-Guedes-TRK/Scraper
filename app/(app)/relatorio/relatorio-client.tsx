'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { parsePreco, fmtBRL, classifyAnunciante } from '@/lib/formatters'
import { portalTable } from '@/lib/portals'
import { PortalBadge } from '@/components/portal-badge'

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

// ── Cartório text parser ───────────────────────────────────────────────────────
type ParsedEntry = { address: string; matricula: string; score: number }

function parseCartorioEntries(text: string): Array<Omit<ParsedEntry, 'score'>> {
  // Match " - DIGITS" — space before dash is required (avoids compound-word dashes).
  // No lookahead: just find every occurrence and split the text around them.
  const re = / -\s*(\d+)/g
  const entries: Array<{ address: string; matricula: string }> = []
  let lastEnd = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const addressPart = text.slice(lastEnd, match.index).trim()
    if (addressPart) entries.push({ address: addressPart, matricula: match[1] })
    lastEnd = match.index + match[0].length
  }
  return entries
}

function scoreAddress(candidate: string, reference: string): number {
  // Score only the tail of the candidate (real address is always at the end).
  // Compare by the SET of numbers present — format-agnostic and robust.
  const tail = candidate.slice(-120)
  const numSet = (s: string) =>
    new Set((s.match(/\d+/g) ?? []).map(n => String(parseInt(n, 10))))
  const c = numSet(tail), r = numSet(reference)
  let matches = 0
  r.forEach(n => { if (c.has(n)) matches++ })
  return matches
}

// ── MatriculaQueueModal ───────────────────────────────────────────────────────
function MatriculaQueueModal({ queue, onSave, onDesistir, onClose }: {
  queue: Imovel[]
  onSave: (item: Imovel, matricula: string) => Promise<void>
  onDesistir: (item: Imovel) => Promise<void>
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const item = queue[idx]
  const done = idx >= queue.length

  const advance = () => {
    setIdx(i => i + 1)
    setValue('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  const save = async () => {
    if (!value.trim() || saving) return
    setSaving(true)
    await onSave(item, value.trim())
    setSaving(false)
    advance()
  }

  const desistir = async () => {
    if (saving) return
    setSaving(true)
    await onDesistir(item)
    setSaving(false)
    advance()
  }

  const backdrop = (
    <div role="button" tabIndex={0}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose() }} />
  )

  if (done) return (
    <>
      {backdrop}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="rounded-xl w-full max-w-sm shadow-2xl p-8 text-center pointer-events-auto"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <p className="text-lg font-bold text-foreground mb-1">Tudo preenchido</p>
          <p className="text-sm text-muted-foreground mb-6">
            {queue.length} imóvel{queue.length !== 1 ? 'is' : ''} processado{queue.length !== 1 ? 's' : ''}
          </p>
          <button onClick={onClose}
            className="text-sm font-semibold px-6 py-2.5 rounded-lg text-white bg-primary hover:bg-primary-h transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {backdrop}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="rounded-xl w-full max-w-md shadow-2xl overflow-hidden pointer-events-auto"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          onKeyDown={e => e.stopPropagation()}>

          {/* Progress bar */}
          <div className="h-1" style={{ background: 'var(--muted)' }}>
            <div className="h-1 transition-all duration-300"
              style={{ width: `${(idx / queue.length) * 100}%`, background: 'var(--foreground)' }} />
          </div>

          {/* Header */}
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs font-mono text-muted-foreground">{idx + 1} / {queue.length}</span>
            <button onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-5 pt-5 pb-4 flex flex-col gap-4">
            {/* Address */}
            <div>
              <p className="text-xl font-bold text-foreground leading-snug">{formatEndereco(item)}</p>
              <div className="flex items-center gap-3 mt-2">
                <PortalBadge portal={item.portal} />
                {item.maps_link && (
                  <a href={item.maps_link} target="_blank" rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Maps ↗
                  </a>
                )}
                <a href={item.link} target="_blank" rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  anúncio ↗
                </a>
              </div>
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
              placeholder="Número da matrícula"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="w-full rounded-lg px-4 py-3 text-lg font-mono text-foreground outline-none focus:ring-2 ring-foreground/20 transition-all"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={desistir} disabled={saving}
                className="flex-1 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 px-3 py-2.5 rounded-lg transition-colors disabled:opacity-40">
                Sem matrícula / Desistimos
              </button>
              <button onClick={save} disabled={saving || !value.trim()}
                className="flex-1 text-sm font-semibold text-white bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors">
                {saving ? 'Salvando…' : 'Salvar →'}
              </button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground/40">Enter para salvar</p>
          </div>
        </div>
      </div>
    </>
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
export function RelatorioClient() {
  const { toasts, toast } = useToast()
  const [items, setItems] = useState<Imovel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [whatsappText, setWhatsappText] = useState('')
  const [editItem, setEditItem] = useState<Imovel | null>(null)
  const [matriculaItem, setMatriculaItem] = useState<Imovel | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)

  const queue = useMemo(
    () => items
      .filter(i => i.status_solicitacao === 'enviado' && !i.numero_matricula)
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

  const markSelected = async (status: string) => {
    if (!selected.size) { toast('Selecione ao menos um imóvel.', 'info'); return }
    const byPortal: Record<string, string[]> = {}
    items.filter(i => selected.has(i.link)).forEach(i => {
      if (!byPortal[i.portal]) byPortal[i.portal] = []
      byPortal[i.portal].push(i.link)
    })
    try {
      const res = await fetch('/api/relatorio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status_solicitacao', byPortal, status }),
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
    setItems(prev => prev.map(i => selected.has(i.link) ? { ...i, status_solicitacao: status } : i))
    const count = selected.size
    setSelected(new Set())
    toast(`${count} imóveis atualizados`, 'success')
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

  const handleQueueSave = async (item: Imovel, matricula: string) => {
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
    setItems(prev => prev.map(i => i.link === item.link ? { ...i, numero_matricula: matricula } : i))
  }

  const handleDesistir = async (item: Imovel) => {
    const res = await fetch('/api/relatorio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'matricula', link: item.link, portal: item.portal, numero_matricula: 'N/A' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast(`Erro: ${d.error ?? res.status}`, 'error')
      return
    }
    setItems(prev => prev.map(i => i.link === item.link ? { ...i, numero_matricula: 'N/A' } : i))
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

  const btn = 'text-sm font-medium px-4 py-2 rounded-lg transition-colors'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2328]">Relatório para Cartório</h1>
          <p className="text-[#656d76] text-sm mt-1">Imóveis aprovados e visitados · solicitação de matrícula e ônus reais</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setQueueOpen(true)} disabled={!queue.length}
            className={`${btn} border border-[#d0d7de] text-[#1f2328] hover:border-[#8c959f] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Preencher matrículas{queue.length ? ` (${queue.length})` : ''}
          </button>
          <button onClick={exportExcel}
            className={`${btn} border border-[#d0d7de] text-[#1f2328] hover:border-[#8c959f] flex items-center gap-2`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M3 12h18M3 16.5h18M7.5 3v18" />
            </svg>
            Exportar Excel
          </button>
          <button onClick={generateWhatsApp}
            className={`${btn} bg-green-600 hover:bg-green-500 text-white flex items-center gap-2`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.529 5.843L.057 23.571a.5.5 0 00.622.622l5.728-1.472A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 01-5.098-1.398l-.361-.215-3.742.962.998-3.634-.236-.374A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Gerar WhatsApp
          </button>
          <button onClick={() => markSelected('enviado')} disabled={!selected.size}
            className={`${btn} bg-primary hover:bg-primary-h disabled:opacity-40 disabled:cursor-not-allowed text-white`}>
            Marcar enviado ({selected.size})
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
      {queueOpen && (
        <MatriculaQueueModal
          queue={queue}
          onSave={handleQueueSave}
          onDesistir={handleDesistir}
          onClose={() => setQueueOpen(false)}
        />
      )}
      <ToastStack toasts={toasts} />
    </div>
  )
}
