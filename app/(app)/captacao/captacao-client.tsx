'use client'

import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { SearchInput, Select } from '@/components/ui/toolbar'
import { fmtBRL } from '@/lib/formatters'

export type Lead = {
  codigo_imovel: string
  proprietario: string | null
  telefone: string | null
  tipo_imovel: string | null
  bairro: string | null
  cidade: string | null
  endereco: string | null
  area_util: number | null
  valor_locacao: number | null
  dias_inativo: number | null
  desde: string | null
  lat: number | null
  lng: number | null
}

const ALL = '__all__'

function waLink(phone: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}`
}
function mapsLink(l: Lead): string | null {
  if (l.lat && l.lng) return `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`
  if (l.endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.endereco}, ${l.bairro ?? ''}, Brasília-DF`)}`
  return null
}
function inativoLabel(d: number | null): string {
  if (d == null) return '—'
  if (d < 60) return `${d} d`
  if (d < 730) return `${Math.round(d / 30)} meses`
  return `${(d / 365).toFixed(1)} anos`
}
function prazoBand(d: number | null): { label: string; color: string } {
  if (d == null) return { label: 'sem data', color: '#94a3b8' }
  if (d >= 1460) return { label: '48m+', color: '#c08a3e' }
  if (d >= 1095) return { label: '36–48m', color: '#a98a5a' }
  if (d >= 730) return { label: '24–36m', color: '#7d9466' }
  if (d >= 365) return { label: '12–24m', color: '#5b8aa6' }
  return { label: '< 12m', color: '#94a3b8' }
}

export function CaptacaoClient({ leads }: { leads: Lead[] }) {
  const [view, setView] = useState<'prazo' | 'curadoria'>('prazo')
  const [q, setQ] = useState('')
  const [bairro, setBairro] = useState(ALL)
  const [tipo, setTipo] = useState(ALL)
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const toggle = (k: string) => setFechados(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleSel = (cod: string) => setSel(prev => { const n = new Set(prev); n.has(cod) ? n.delete(cod) : n.add(cod); return n })
  const setSelMany = (cods: string[], on: boolean) => setSel(prev => { const n = new Set(prev); cods.forEach(c => on ? n.add(c) : n.delete(c)); return n })

  const bairros = useMemo(() => Array.from(new Set(leads.map(l => l.bairro).filter(Boolean) as string[])).sort(), [leads])
  const tipos = useMemo(() => Array.from(new Set(leads.map(l => l.tipo_imovel).filter(Boolean) as string[])).sort(), [leads])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads.filter(l => {
      if (bairro !== ALL && l.bairro !== bairro) return false
      if (tipo !== ALL && l.tipo_imovel !== tipo) return false
      if (needle) {
        const hay = `${l.codigo_imovel} ${l.proprietario ?? ''} ${l.endereco ?? ''} ${l.bairro ?? ''} ${l.telefone ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [leads, q, bairro, tipo])

  const kpis = useMemo(() => {
    let soma = 0, n = 0, antigos = 0
    for (const l of filtered) {
      if (l.valor_locacao) { soma += Number(l.valor_locacao); n++ }
      if ((l.dias_inativo ?? 0) >= 1460) antigos++
    }
    return { total: filtered.length, medio: n ? Math.round(soma / n) : 0, bairros: new Set(filtered.map(l => l.bairro).filter(Boolean)).size, antigos }
  }, [filtered])

  const blocos = useMemo(() => {
    const defs: { key: string; label: string; accent: string; hint?: string }[] = [
      { key: '0-12', label: 'Até 12 meses', accent: 'var(--border)' },
      { key: '12-24', label: '12 a 24 meses', accent: 'var(--border)' },
      { key: '24-36', label: '24 a 36 meses', accent: 'var(--border)' },
      { key: '36-48', label: '36 a 48 meses', accent: 'var(--border)' },
      { key: '48+', label: '48 meses ou mais', accent: '#c08a3e', hint: 'contrato já ciclou — win-back forte' },
      { key: 'sem', label: 'Sem data', accent: 'var(--border)' },
    ]
    const groups = new Map<string, Lead[]>()
    for (const l of filtered) {
      const d = l.dias_inativo
      const k = d == null ? 'sem' : d < 365 ? '0-12' : d < 730 ? '12-24' : d < 1095 ? '24-36' : d < 1460 ? '36-48' : '48+'
      ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(l)
    }
    return defs.map(def => {
      const ls = groups.get(def.key) ?? []
      let soma = 0, n = 0
      for (const l of ls) if (l.valor_locacao) { soma += Number(l.valor_locacao); n++ }
      return { ...def, leads: ls, medio: n ? Math.round(soma / n) : 0 }
    }).filter(b => b.leads.length > 0)
  }, [filtered])

  // Curadoria: agrupado por proprietário (dono pode ter vários imóveis), priorizando quem tem mais e mais antigo
  const donos = useMemo(() => {
    const map = new Map<string, { nome: string; telefone: string | null; imoveis: Lead[] }>()
    for (const l of filtered) {
      const key = `${l.proprietario ?? '?'}|${l.telefone ?? ''}`
      if (!map.has(key)) map.set(key, { nome: l.proprietario ?? '—', telefone: l.telefone, imoveis: [] })
      map.get(key)!.imoveis.push(l)
    }
    return Array.from(map.values()).sort((a, b) =>
      b.imoveis.length - a.imoveis.length ||
      Math.max(...b.imoveis.map(i => i.dias_inativo ?? 0)) - Math.max(...a.imoveis.map(i => i.dias_inativo ?? 0)),
    )
  }, [filtered])

  const criar = async () => {
    const escolhidos = filtered.filter(l => sel.has(l.codigo_imovel))
    if (!escolhidos.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/captacao/curadoria', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imoveis: escolhidos }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setMsg(`${escolhidos.length} imóvel(is) na fila de Oportunidades ✓`); setSel(new Set()) }
      else setMsg(`Erro: ${d.error ?? res.status}`)
    } catch { setMsg('Erro ao enviar') }
    finally { setSaving(false); setTimeout(() => setMsg(null), 3500) }
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Nido · dw_trk"
        title="Alugamos, não Administramos"
        subtitle="Imóveis que a TRK alugou mas não administra — donos quentes para reconquistar a administração."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <StatTile label="Leads na lista" value={kpis.total} accent="#6e4d34" sublabel="dono já alugou conosco" />
        <StatTile label="Aluguel médio" value={kpis.medio ? fmtBRL(kpis.medio) : '—'} accent="#5d7a43" sublabel="última locação fechada" />
        <StatTile label="Proprietários" value={donos.length} accent="#0ea5e9" sublabel="donos distintos" />
        <StatTile label="48+ meses" value={kpis.antigos} accent="#c08a3e" sublabel="win-back forte" />
      </div>

      {/* toggle de visualização */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {([['prazo', 'Por prazo'], ['curadoria', 'Curadoria']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 h-9 text-[13px] font-medium transition-colors ${view === v ? 'text-white' : 'text-muted-foreground hover:text-foreground'}`}
              style={view === v ? { background: '#6e4d34' } : undefined}>
              {label}
            </button>
          ))}
        </div>
        <div className="w-56"><SearchInput value={q} onChange={setQ} placeholder="Proprietário, endereço, VK…" /></div>
        <Select value={bairro} onChange={setBairro} options={[{ value: ALL, label: 'Todos os bairros' }, ...bairros.map(b => ({ value: b, label: b }))]} />
        <Select value={tipo} onChange={setTipo} options={[{ value: ALL, label: 'Todos os tipos' }, ...tipos.map(tp => ({ value: tp, label: tp }))]} />
        <span className="text-xs text-muted-foreground ml-auto font-mono">{filtered.length} de {leads.length}</span>
      </div>

      {/* VIEW: por prazo (atual) */}
      {view === 'prazo' && (
        blocos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum lead com esses filtros.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {blocos.map(b => {
              const aberto = !fechados.has(b.key)
              return (
                <div key={b.key} className="card rounded-xl overflow-hidden">
                  <button onClick={() => toggle(b.key)} className="w-full flex items-center justify-between px-4 py-2.5 gap-3 text-left hover:bg-accent/30 transition-colors"
                    style={{ borderBottom: aberto ? '1px solid var(--border)' : 'none', borderLeft: `3px solid ${b.accent}`, background: 'var(--secondary)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      <span className="text-[13px] font-semibold text-foreground">{b.label}</span>
                      {b.hint && <span className="text-[11px] text-muted-foreground hidden sm:inline truncate">· {b.hint}</span>}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">{b.leads.length} imóveis · média {b.medio ? fmtBRL(b.medio) : '—'}</span>
                  </button>
                  {aberto && (
                    <>
                      <div className="grid grid-cols-[1.4fr_1.6fr_auto_auto_auto] gap-3 px-4 py-1.5 text-[10px] eyebrow text-muted-foreground" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span>Proprietário</span><span>Imóvel</span><span className="text-right">Aluguel</span><span className="text-right">Inativo há</span><span className="text-right">Ação</span>
                      </div>
                      {b.leads.map(l => <Row key={l.codigo_imovel} l={l} />)}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* VIEW: curadoria (por proprietário, com seleção) */}
      {view === 'curadoria' && (
        <>
          <p className="text-[11px] text-muted-foreground mb-2">Selecione os imóveis que valem virar <strong className="text-foreground">Oportunidade</strong> (curadoria). Agrupados por proprietário — um dono pode ter vários imóveis.</p>
          {donos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum lead com esses filtros.</p>
          ) : (
            <div className="flex flex-col gap-3 pb-20">
              {donos.map(dono => <DonoCard key={`${dono.nome}|${dono.telefone}`} dono={dono} sel={sel} onToggle={toggleSel} onToggleAll={setSelMany} />)}
            </div>
          )}

          {/* barra de ação */}
          {sel.size > 0 && (
            <div className="sticky bottom-3 z-20 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <span className="text-[13px] font-semibold text-foreground">{sel.size} imóvel(is) selecionado(s)</span>
              <button onClick={() => setSel(new Set())} className="text-[12px] text-muted-foreground hover:text-foreground ml-auto">limpar</button>
              <button onClick={criar} disabled={saving} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90" style={{ background: '#6e4d34' }}>
                {saving ? 'Enviando…' : 'Criar oportunidades →'}
              </button>
            </div>
          )}
        </>
      )}

      {msg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white z-50" style={{ background: msg.startsWith('Erro') ? '#dc2626' : '#16a34a' }}>{msg}</div>
      )}
    </div>
  )
}

type Dono = { nome: string; telefone: string | null; imoveis: Lead[] }

function DonoCard({ dono, sel, onToggle, onToggleAll }: {
  dono: Dono; sel: Set<string>; onToggle: (cod: string) => void; onToggleAll: (cods: string[], on: boolean) => void
}) {
  const cods = dono.imoveis.map(i => i.codigo_imovel)
  const allSel = cods.every(c => sel.has(c))
  const someSel = cods.some(c => sel.has(c))
  const wa = waLink(dono.telefone)
  const somaSel = dono.imoveis.filter(i => sel.has(i.codigo_imovel)).reduce((s, i) => s + (Number(i.valor_locacao) || 0), 0)
  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--secondary)' }}>
        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel }}
          onChange={e => onToggleAll(cods, e.target.checked)} style={{ accentColor: '#6e4d34', width: 16, height: 16 }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{dono.nome}</p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{dono.telefone ?? 'sem telefone'} · {dono.imoveis.length} imóvel(is){somaSel > 0 ? ` · sel. ${fmtBRL(somaSel)}` : ''}</p>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-85 shrink-0" style={{ background: '#5d7a43' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.15L3 21l1.85-6.4A8 8 0 1121 12z" /></svg>
          </a>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {dono.imoveis.map(im => {
          const band = prazoBand(im.dias_inativo)
          const checked = sel.has(im.codigo_imovel)
          return (
            <label key={im.codigo_imovel} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors" style={{ background: checked ? 'var(--accent)' : undefined }}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(im.codigo_imovel)} style={{ accentColor: '#6e4d34', width: 16, height: 16 }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-foreground truncate font-mono"><span className="font-semibold">{im.codigo_imovel}</span>{im.endereco ? ` · ${im.endereco}` : ''}</p>
                <p className="text-[11px] text-muted-foreground truncate">{[im.tipo_imovel, im.bairro, im.area_util ? `${Math.round(Number(im.area_util))} m²` : null].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <span className="text-[13px] font-bold font-mono text-foreground tabular shrink-0">{im.valor_locacao ? fmtBRL(Number(im.valor_locacao)) : '—'}</span>
              <span className="text-[9px] px-2 py-1 rounded-full text-white shrink-0 whitespace-nowrap" style={{ background: band.color }}>{band.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function Row({ l }: { l: Lead }) {
  const wa = waLink(l.telefone)
  const maps = mapsLink(l)
  return (
    <div className="grid grid-cols-[1.4fr_1.6fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-accent/40 transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">{l.proprietario ?? '—'}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{l.telefone ?? 'sem telefone'}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-foreground truncate">{[l.tipo_imovel, l.bairro].filter(Boolean).join(' · ') || '—'}</p>
        <p className="text-[11px] text-muted-foreground truncate font-mono"><span className="text-foreground/80 font-semibold">{l.codigo_imovel}</span>{l.endereco ? ` · ${l.endereco}` : ''}{l.area_util ? ` · ${Math.round(Number(l.area_util))} m²` : ''}</p>
      </div>
      <div className="text-right"><p className="text-[13px] font-bold font-mono text-foreground tabular">{l.valor_locacao ? fmtBRL(Number(l.valor_locacao)) : '—'}</p></div>
      <div className="text-right"><span className="text-[11px] font-mono text-muted-foreground">{inativoLabel(l.dias_inativo)}</span></div>
      <div className="flex items-center gap-1.5 justify-end">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" title="Chamar no WhatsApp" className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-85" style={{ background: '#5d7a43' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.15L3 21l1.85-6.4A8 8 0 1121 12z" /></svg>
          </a>
        )}
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer" title="Ver no mapa" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" style={{ border: '1px solid var(--border)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" /></svg>
          </a>
        )}
      </div>
    </div>
  )
}
