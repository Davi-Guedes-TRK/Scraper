'use client'

import { useMemo, useState, useTransition } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { addProcesso, setStatus, delProcesso, marcarSolicitado } from './actions'
import { oficioFor, envioLink, OFICIOS, type Oficio, type Canal } from '@/lib/oficios'

export type Processo = {
  id: string
  responsavel: string
  codigo_imovel: string | null
  matricula: string | null
  cartorio: string | null
  regiao: string | null
  status: string
  observacao: string | null
  created_at: string
  updated_at: string
}

const STATUS = [
  { key: 'pendente', label: 'A solicitar', accent: '#9a8866' },
  { key: 'solicitado', label: 'Solicitado', accent: '#c08a3e' },
  { key: 'recebido', label: 'Recebido', accent: '#5b7fa6' },
  { key: 'com_onus', label: 'Com ônus', accent: '#b4543a' },
  { key: 'limpo', label: 'Limpo / OK', accent: '#5d7a43' },
]
const labelOf = (k: string) => STATUS.find(s => s.key === k)?.label ?? k

const CANAL_LABEL: Record<Canal, string> = { whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone' }
const CANAL_ACCENT: Record<Canal, string> = { whatsapp: '#5d7a43', email: '#5b7fa6', telefone: '#c08a3e' }
const CANAL_VERBO: Record<Canal, string> = { whatsapp: 'Enviar no WhatsApp', email: 'Enviar e-mail', telefone: 'Ligar' }

const inputCls = 'h-9 px-2.5 rounded-lg text-[13px] bg-transparent text-foreground outline-none focus:ring-2 focus:ring-accent'
const inputStyle = { border: '1px solid var(--border)' } as const

type Grupo = { key: string; oficio: Oficio | null; itens: Processo[] }

export function CartorioClient({ processos, nome }: { processos: Processo[]; nome: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const kpis = useMemo(() => ({
    total: processos.length,
    pendentes: processos.filter(p => p.status === 'pendente').length,
    onus: processos.filter(p => p.status === 'com_onus').length,
    limpos: processos.filter(p => p.status === 'limpo').length,
  }), [processos])

  // Para enviar: pendentes agrupados por ofício (resolvido pela região)
  const envio = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>()
    for (const p of processos.filter(p => p.status === 'pendente')) {
      const of = oficioFor(p.regiao)
      const key = of?.nome ?? '__sem__'
      if (!map.has(key)) map.set(key, { key, oficio: of, itens: [] })
      map.get(key)!.itens.push(p)
    }
    const ordem = (k: string) => { const i = OFICIOS.findIndex(o => o.nome === k); return i === -1 ? 99 : i }
    return Array.from(map.values()).sort((a, b) => ordem(a.key) - ordem(b.key))
  }, [processos])

  const grupos = useMemo(
    () => STATUS.map(s => ({ ...s, itens: processos.filter(p => p.status === s.key) })).filter(g => g.itens.length > 0),
    [processos],
  )

  return (
    <div className="p-4 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Documentos · por usuário"
        title="Meu Cartório"
        subtitle={`Olá, ${nome} — seus processos de matrícula/ônus. As matrículas "a solicitar" já vêm agrupadas pelo ofício certo, prontas pra enviar.`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <StatTile label="Processos" value={kpis.total} accent="#6e4d34" sublabel="seus, no total" />
        <StatTile label="A solicitar" value={kpis.pendentes} accent="#9a8866" sublabel="prontos pra enviar" />
        <StatTile label="Com ônus" value={kpis.onus} accent="#b4543a" sublabel="precisa resolver" />
        <StatTile label="Limpos" value={kpis.limpos} accent="#5d7a43" sublabel="sem ônus / OK" />
      </div>

      {/* Novo processo */}
      <div className="card rounded-xl overflow-hidden mb-4">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/30 transition-colors" style={{ background: 'var(--secondary)' }}>
          <span className="text-[13px] font-semibold text-foreground">+ Novo processo</span>
          <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
        </button>
        {open && (
          <form action={(fd) => { start(() => addProcesso(fd)); setOpen(false) }} className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2.5" style={{ borderTop: '1px solid var(--border)' }}>
            <input name="matricula" placeholder="Matrícula" className={inputCls} style={inputStyle} />
            <input name="codigo_imovel" placeholder="Código do imóvel (VK…)" className={inputCls} style={inputStyle} />
            <input name="regiao" placeholder="Região (Lago Sul, Asa Norte…)" className={inputCls} style={inputStyle} />
            <input name="cartorio" placeholder="Cartório (opcional — auto pela região)" className={`${inputCls} col-span-2 md:col-span-1`} style={inputStyle} />
            <select name="status" defaultValue="pendente" className={inputCls} style={inputStyle}>
              {STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input name="observacao" placeholder="Observação" className={inputCls} style={inputStyle} />
            <div className="col-span-2 md:col-span-3 flex justify-end">
              <button type="submit" disabled={pending} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50" style={{ background: '#6e4d34' }}>
                {pending ? 'Salvando…' : 'Adicionar'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Para enviar — por ofício */}
      {envio.length > 0 && (
        <div className="mb-5">
          <h2 className="eyebrow text-[10px] text-muted-foreground mb-2 px-1">Para enviar — por ofício</h2>
          <div className="flex flex-col gap-3">
            {envio.map(g => <EnvioCard key={g.key} g={g} pending={pending} start={start} />)}
          </div>
        </div>
      )}

      {/* Todos os processos por status */}
      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhum processo ainda. Clique em <strong>+ Novo processo</strong> pra começar.</p>
      ) : (
        <>
          <h2 className="eyebrow text-[10px] text-muted-foreground mb-2 px-1">Todos os processos</h2>
          <div className="flex flex-col gap-3">
            {grupos.map(g => (
              <div key={g.key} className="card rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${g.accent}`, background: 'var(--secondary)' }}>
                  <span className="text-[13px] font-semibold text-foreground">{g.label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{g.itens.length}</span>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {g.itens.map(p => <Linha key={p.id} p={p} pending={pending} start={start} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EnvioCard({ g, pending, start }: { g: Grupo; pending: boolean; start: (cb: () => void) => void }) {
  const of = g.oficio
  const mats = g.itens.map(p => p.matricula).filter(Boolean) as string[]
  const link = of ? envioLink(of, mats) : null
  const ids = g.itens.map(i => i.id)
  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 gap-3" style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${of ? CANAL_ACCENT[of.canal] : 'var(--border)'}`, background: 'var(--secondary)' }}>
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-foreground">{of?.nome ?? 'Ofício não identificado'}</span>
          {of && <span className="text-[11px] text-muted-foreground ml-2">{CANAL_LABEL[of.canal]} · {of.contato}</span>}
        </div>
        <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{g.itens.length} matrícula(s)</span>
      </div>
      <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1">
        {g.itens.map(p => (
          <span key={p.id} className="text-[11px] font-mono">
            {p.matricula ? <span className="text-foreground">{p.matricula}</span> : <span className="text-red-600/80">sem matrícula</span>}
            {p.codigo_imovel ? <span className="text-muted-foreground"> ({p.codigo_imovel})</span> : ''}
          </span>
        ))}
      </div>
      <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
        {of && link ? (
          <a href={link} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white flex items-center transition-opacity hover:opacity-85" style={{ background: CANAL_ACCENT[of.canal] }}>
            {CANAL_VERBO[of.canal]}
          </a>
        ) : (
          <span className="text-[11px] text-amber-700">Região não mapeada — preencha o ofício manualmente nesses processos.</span>
        )}
        {of && (
          <button onClick={() => start(() => marcarSolicitado(ids))} disabled={pending} className="h-8 px-3 rounded-lg text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50" style={{ border: '1px solid var(--border)' }}>
            Marcar como solicitado
          </button>
        )}
      </div>
    </div>
  )
}

function Linha({ p, pending, start }: { p: Processo; pending: boolean; start: (cb: () => void) => void }) {
  const of = oficioFor(p.regiao)
  const meta = [p.cartorio || of?.nome, p.regiao].filter(Boolean).join(' · ')
  return (
    <div className="grid grid-cols-[1.4fr_1.3fr_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-accent/30 transition-colors">
      <div className="min-w-0">
        <p className="text-[12px] text-foreground truncate font-mono">
          {p.matricula ? <span className="font-semibold">mat. {p.matricula}</span> : <span className="text-muted-foreground">sem matrícula</span>}
          {p.codigo_imovel ? ` · ${p.codigo_imovel}` : ''}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{meta || '—'}</p>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{p.observacao ?? ''}</p>
      <select
        value={p.status}
        disabled={pending}
        onChange={e => start(() => setStatus(p.id, e.target.value))}
        className="h-8 px-2 rounded-lg text-[11px] bg-transparent text-foreground outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
        style={{ border: '1px solid var(--border)' }}
        title="Mudar status"
      >
        {STATUS.map(s => <option key={s.key} value={s.key}>{labelOf(s.key)}</option>)}
      </select>
      <button
        onClick={() => { if (confirm('Excluir este processo?')) start(() => delProcesso(p.id)) }}
        disabled={pending}
        title="Excluir"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
        style={{ border: '1px solid var(--border)' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  )
}
