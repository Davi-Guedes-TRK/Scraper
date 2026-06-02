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

export function CaptacaoClient({ leads }: { leads: Lead[] }) {
  const [q, setQ] = useState('')
  const [bairro, setBairro] = useState(ALL)
  const [tipo, setTipo] = useState(ALL)

  const bairros = useMemo(() => Array.from(new Set(leads.map(l => l.bairro).filter(Boolean) as string[])).sort(), [leads])
  const tipos = useMemo(() => Array.from(new Set(leads.map(l => l.tipo_imovel).filter(Boolean) as string[])).sort(), [leads])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads.filter(l => {
      if (bairro !== ALL && l.bairro !== bairro) return false
      if (tipo !== ALL && l.tipo_imovel !== tipo) return false
      if (needle) {
        const hay = `${l.proprietario ?? ''} ${l.endereco ?? ''} ${l.bairro ?? ''} ${l.telefone ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [leads, q, bairro, tipo])

  const kpis = useMemo(() => {
    let soma = 0, n = 0, recentes = 0
    for (const l of filtered) {
      if (l.valor_locacao) { soma += Number(l.valor_locacao); n++ }
      if ((l.dias_inativo ?? 99999) < 365) recentes++
    }
    return { total: filtered.length, medio: n ? Math.round(soma / n) : 0, bairros: new Set(filtered.map(l => l.bairro).filter(Boolean)).size, recentes }
  }, [filtered])

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Nido · dw_trk"
        title="Alugamos, não Administramos"
        subtitle="Imóveis que a TRK alugou mas não administra (Negociado/Inativo no Nido) — donos quentes para reconquistar a administração."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <StatTile label="Leads na lista" value={kpis.total} accent="#6e4d34" sublabel="dono já alugou conosco" />
        <StatTile label="Aluguel médio" value={kpis.medio ? fmtBRL(kpis.medio) : '—'} accent="#5d7a43" sublabel="última locação fechada" />
        <StatTile label="Bairros" value={kpis.bairros} accent="#0ea5e9" sublabel="cobertura" />
        <StatTile label="Recentes" value={kpis.recentes} accent="#c08a3e" sublabel="negociado < 1 ano" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="w-60"><SearchInput value={q} onChange={setQ} placeholder="Proprietário, endereço, telefone…" /></div>
        <Select value={bairro} onChange={setBairro} options={[{ value: ALL, label: 'Todos os bairros' }, ...bairros.map(b => ({ value: b, label: b }))]} />
        <Select value={tipo} onChange={setTipo} options={[{ value: ALL, label: 'Todos os tipos' }, ...tipos.map(tp => ({ value: tp, label: tp }))]} />
        <span className="text-xs text-muted-foreground ml-auto font-mono">{filtered.length} de {leads.length}</span>
      </div>

      <div className="card rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1.6fr_auto_auto_auto] gap-3 px-4 py-2 text-[10px] eyebrow text-muted-foreground" style={{ borderBottom: '1px solid var(--border)' }}>
          <span>Proprietário</span>
          <span>Imóvel</span>
          <span className="text-right">Aluguel</span>
          <span className="text-right">Inativo há</span>
          <span className="text-right">Ação</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum lead com esses filtros.</p>
        ) : (
          filtered.map(l => <Row key={l.codigo_imovel} l={l} />)
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        São imóveis cuja <strong className="text-foreground">locação a TRK fechou</strong> mas o proprietário optou por <strong className="text-foreground">não deixar a gente administrar</strong>.
        O dono já confia na TRK como corretora — o pitch é trazer a administração. <strong>Inativo há</strong> = tempo desde a última movimentação (mais antigo ⇒ contrato pode estar vencendo).
      </p>
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
        <p className="text-[11px] text-muted-foreground truncate font-mono">{l.endereco}{l.area_util ? ` · ${Math.round(Number(l.area_util))} m²` : ''}</p>
      </div>
      <div className="text-right">
        <p className="text-[13px] font-bold font-mono text-foreground tabular">{l.valor_locacao ? fmtBRL(Number(l.valor_locacao)) : '—'}</p>
      </div>
      <div className="text-right">
        <span className="text-[11px] font-mono text-muted-foreground">{inativoLabel(l.dias_inativo)}</span>
      </div>
      <div className="flex items-center gap-1.5 justify-end">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" title="Chamar no WhatsApp"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-85" style={{ background: '#5d7a43' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.15L3 21l1.85-6.4A8 8 0 1121 12z" />
            </svg>
          </a>
        )}
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer" title="Ver no mapa"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" style={{ border: '1px solid var(--border)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}
