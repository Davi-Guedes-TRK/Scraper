'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { SearchInput } from '@/components/ui/toolbar'

export type Proprietario = {
  codigo_pessoa: string
  nome: string | null
  telefones: string[] | null
  emails: string[] | null
  cidade: string | null
  uf: string | null
  n_imoveis: number
  tipos: string[] | null
}

type FilaRow = { codigo_pessoa: string; status: string; erro: string | null; tem_dossie: boolean }

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  pendente: { label: 'na fila', bg: 'color-mix(in srgb, var(--chart-3) 18%, transparent)', fg: 'var(--chart-3)' },
  gerado: { label: 'pronto', bg: 'color-mix(in srgb, var(--success) 18%, transparent)', fg: 'var(--success)' },
  erro: { label: 'erro', bg: 'color-mix(in srgb, var(--destructive) 18%, transparent)', fg: 'var(--destructive)' },
}

// Render leve do markdown gerado pelo dossiê (#/##/###, **negrito**, listas "- ", _itálico_ de linha).
function mdInline(text: string): ReactNode[] {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>))
}

function DossieMd({ source }: { source: string }) {
  const out: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    out.push(
      <ul key={`u${out.length}`} className="list-disc pl-5 my-1.5 space-y-1">
        {bullets.map((b, i) => <li key={i} className="text-[12.5px] leading-relaxed text-foreground">{mdInline(b)}</li>)}
      </ul>,
    )
    bullets = []
  }
  for (const raw of source.split('\n')) {
    if (raw.startsWith('- ')) { bullets.push(raw.slice(2)); continue }
    flush()
    const t = raw.trim()
    if (!t) { out.push(<div key={`s${out.length}`} className="h-2.5" />); continue }
    if (t.startsWith('### ')) out.push(<h3 key={out.length} className="text-[12px] font-mono font-semibold mt-3 mb-1" style={{ color: 'var(--chart-1)' }}>{mdInline(t.slice(4))}</h3>)
    else if (t.startsWith('## ')) out.push(<h2 key={out.length} className="text-[14px] font-semibold mt-4 mb-1.5 pb-1" style={{ borderBottom: '1px solid var(--border)' }}>{mdInline(t.slice(3))}</h2>)
    else if (t.startsWith('# ')) out.push(<h1 key={out.length} className="text-[16px] font-bold mb-1 text-foreground">{mdInline(t.slice(2))}</h1>)
    else if (t.length > 1 && t.startsWith('_') && t.endsWith('_')) out.push(<p key={out.length} className="text-[11px] italic text-muted-foreground">{t.slice(1, -1)}</p>)
    else out.push(<p key={out.length} className="text-[12.5px] leading-relaxed text-foreground">{mdInline(t)}</p>)
  }
  flush()
  return <div>{out}</div>
}

export function ProprietariosClient({ proprietarios }: { proprietarios: Proprietario[] }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fila, setFila] = useState<Record<string, FilaRow>>({})
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [dossie, setDossie] = useState<{ nome: string | null; markdown: string } | null>(null)

  async function carregarStatus() {
    try {
      const r = await fetch('/api/dossie')
      if (!r.ok) return
      const rows: FilaRow[] = await r.json()
      const map: Record<string, FilaRow> = {}
      for (const x of rows) map[x.codigo_pessoa] = x
      setFila(map)
    } catch { /* ignore */ }
  }
  useEffect(() => { carregarStatus() }, [])

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return proprietarios
    return proprietarios.filter(p =>
      `${p.nome ?? ''} ${(p.telefones ?? []).join(' ')} ${p.cidade ?? ''} ${p.codigo_pessoa}`.toLowerCase().includes(needle))
  }, [proprietarios, q])

  const toggle = (cod: string) => setSel(s => {
    const n = new Set(s); if (n.has(cod)) n.delete(cod); else n.add(cod); return n
  })

  async function gerar() {
    if (!sel.size) return
    setEnviando(true); setMsg(null)
    try {
      const pessoas = proprietarios.filter(p => sel.has(p.codigo_pessoa)).map(p => ({ codigo_pessoa: p.codigo_pessoa, nome: p.nome }))
      const r = await fetch('/api/dossie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pessoas }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'falha')
      setMsg(`${j.enfileirados} proprietário(s) na fila. Rode o worker on-prem para gerar:  node scripts/dossie_proprietario.mjs --fila`)
      setSel(new Set())
      await carregarStatus()
    } catch (e) {
      setMsg('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'))
    } finally { setEnviando(false) }
  }

  async function verDossie(cod: string) {
    try {
      const r = await fetch(`/api/dossie?codigo=${encodeURIComponent(cod)}`)
      const j = await r.json()
      if (j?.markdown) setDossie({ nome: j.nome, markdown: j.markdown })
      else setMsg('Dossiê ainda não gerado para esse proprietário (rode o worker --fila).')
    } catch { setMsg('Erro ao buscar dossiê.') }
  }

  const kpis = useMemo(() => ({
    proprietarios: proprietarios.length,
    imoveis: proprietarios.reduce((a, p) => a + p.n_imoveis, 0),
    prontos: Object.values(fila).filter(f => f.tem_dossie).length,
  }), [proprietarios, fila])

  return (
    <div className="p-4 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Carteira · Nido"
        title="Proprietários"
        subtitle="Selecione proprietários e gere o dossiê de preparação pra rodada de escuta (roteiro de conversa). O dossiê é montado on-prem a partir do dw_trk."
      />

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <StatTile label="Proprietários" value={kpis.proprietarios} accent="var(--chart-1)" sublabel="com imóvel no Nido" />
        <StatTile label="Imóveis vinculados" value={kpis.imoveis} accent="var(--chart-2)" sublabel="somados" />
        <StatTile label="Dossiês prontos" value={kpis.prontos} accent="var(--success)" sublabel="gerados" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="w-72"><SearchInput value={q} onChange={setQ} placeholder="Nome, telefone, cidade, código…" /></div>
        <button
          onClick={gerar}
          disabled={!sel.size || enviando}
          className="h-8 px-3 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: 'var(--chart-1)' }}
        >
          {enviando ? 'Enviando…' : `Gerar dossiê (${sel.size})`}
        </button>
        <button
          onClick={carregarStatus}
          className="h-8 px-3 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          style={{ border: '1px solid var(--border)' }}
        >
          Atualizar status
        </button>
        <span className="text-xs text-muted-foreground ml-auto font-mono">{filtrados.length} de {proprietarios.length}</span>
      </div>

      {msg && (
        <div className="mb-3 text-[12px] rounded-lg px-3 py-2" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
          {msg}
        </div>
      )}

      <div className="card rounded-xl overflow-hidden">
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtrados.slice(0, 500).map(p => {
            const st = fila[p.codigo_pessoa]
            const badge = st ? STATUS_STYLE[st.status] : null
            const checked = sel.has(p.codigo_pessoa)
            return (
              <div key={p.codigo_pessoa}
                className="grid grid-cols-[auto_1.6fr_1.2fr_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-accent/30 transition-colors">
                <input type="checkbox" checked={checked} onChange={() => toggle(p.codigo_pessoa)}
                  className="w-4 h-4 cursor-pointer accent-[var(--chart-1)]" />
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground truncate font-medium">{p.nome ?? '—'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[(p.tipos ?? []).join(', '), [p.cidade, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-foreground font-mono truncate">{(p.telefones ?? [])[0] ?? 'sem telefone'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{(p.emails ?? [])[0] ?? ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold font-mono text-foreground tabular">{p.n_imoveis}</p>
                  <p className="text-[10px] text-muted-foreground">imóveis</p>
                </div>
                <div className="flex items-center gap-2 justify-end min-w-[110px]">
                  {badge && (
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: badge.bg, color: badge.fg }}
                      title={st?.erro ?? undefined}>
                      {badge.label}
                    </span>
                  )}
                  {st?.tem_dossie && (
                    <button onClick={() => verDossie(p.codigo_pessoa)}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors hover:bg-accent"
                      style={{ border: '1px solid var(--border)', color: 'var(--chart-1)' }}>
                      Ver
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhum proprietário. Se a lista está vazia, rode o <span className="font-mono">dw_sync</span> pra popular o espelho.
            </p>
          )}
        </div>
      </div>

      {filtrados.length > 500 && (
        <p className="text-[11px] text-muted-foreground text-center mt-2">Mostrando 500 — refine a busca pra ver mais.</p>
      )}

      {dossie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDossie(null)}>
          <div className="card rounded-xl max-w-[760px] w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--secondary)' }}>
              <p className="text-[13px] font-semibold text-foreground truncate">Dossiê — {dossie.nome ?? ''}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => navigator.clipboard?.writeText(dossie.markdown)}
                  className="text-[11px] px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground" style={{ border: '1px solid var(--border)' }}>
                  Copiar
                </button>
                <button onClick={() => setDossie(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
              </div>
            </div>
            <div className="p-4 overflow-auto"><DossieMd source={dossie.markdown} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
