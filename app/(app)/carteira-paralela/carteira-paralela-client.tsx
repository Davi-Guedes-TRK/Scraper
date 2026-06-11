'use client'

import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { SearchInput, Select } from '@/components/ui/toolbar'
import { fmtBRL } from '@/lib/formatters'

export type Match = {
  codigo_atendimento: string
  inquilino: string | null
  busca_tipo: string | null
  busca_bairro: string | null
  busca_preco_min: number | string | null
  busca_preco_max: number | string | null
  busca_area_min: number | string | null
  busca_area_max: number | string | null
  busca_dorm: number | null
  codigo_imovel: string
  tipo_imovel: string | null
  bairro: string | null
  endereco: string | null
  area_util: number | string | null
  qtd_dormitorios: number | null
  preco_locacao: number | string | null
  proprietario: string | null
  telefone: string | null
  lat: number | null
  lng: number | null
}

const ALL = '__all__'
const n = (v: number | string | null) => (v == null ? null : Number(v))

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}?text=${encodeURIComponent(text)}`
}
function mapsLink(m: Match): string | null {
  if (m.lat && m.lng) return `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`
  if (m.endereco) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${m.endereco}, ${m.bairro ?? ''}, Brasília-DF`)}`
  return null
}

type Grupo = { atendimento: string; inquilino: string | null; tipo: string | null; bairro: string | null; precoMax: number | null; imoveis: Match[] }

export function CarteiraParalelaClient({ matches }: { matches: Match[] }) {
  const [q, setQ] = useState('')
  const [bairro, setBairro] = useState(ALL)
  const [tipoFiltro, setTipoFiltro] = useState(ALL)
  const [precoMin, setPrecoMin] = useState('')
  const [precoMax, setPrecoMax] = useState('')
  const [areaMin, setAreaMin] = useState('')

  const bairros = useMemo(() => Array.from(new Set(matches.map(m => m.busca_bairro).filter(Boolean) as string[])).sort(), [matches])
  const tiposImovel = useMemo(() => Array.from(new Set(matches.map(m => m.tipo_imovel).filter(Boolean) as string[])).sort(), [matches])

  const grupos = useMemo<Grupo[]>(() => {
    const pMin = precoMin ? Number(precoMin) : 0
    const pMax = precoMax ? Number(precoMax) : Infinity
    const aMn = areaMin ? Number(areaMin) : 0
    const map = new Map<string, Grupo>()
    for (const m of matches) {
      if (bairro !== ALL && m.busca_bairro !== bairro) continue
      if (tipoFiltro !== ALL && m.tipo_imovel !== tipoFiltro) continue
      const preco = n(m.preco_locacao)
      if (preco !== null && (preco < pMin || preco > pMax)) continue
      const area = n(m.area_util)
      if (aMn > 0 && area !== null && area < aMn) continue
      if (!map.has(m.codigo_atendimento)) {
        map.set(m.codigo_atendimento, {
          atendimento: m.codigo_atendimento, inquilino: m.inquilino, tipo: m.busca_tipo,
          bairro: m.busca_bairro, precoMax: n(m.busca_preco_max), imoveis: [],
        })
      }
      map.get(m.codigo_atendimento)!.imoveis.push(m)
    }
    let list = Array.from(map.values())
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter(g =>
        `${g.inquilino ?? ''} ${g.tipo ?? ''} ${g.bairro ?? ''}`.toLowerCase().includes(needle) ||
        g.imoveis.some(i => `${i.proprietario ?? ''} ${i.endereco ?? ''} ${i.codigo_imovel} ${i.telefone ?? ''}`.toLowerCase().includes(needle)),
      )
    }
    // Ordenar por maior VK (preco_locacao) do melhor imóvel de cada grupo
    return list.sort((a, b) => {
      const maxA = Math.max(...a.imoveis.map(i => n(i.preco_locacao) ?? 0))
      const maxB = Math.max(...b.imoveis.map(i => n(i.preco_locacao) ?? 0))
      return maxB - maxA
    })
  }, [matches, q, bairro, tipoFiltro, precoMin, precoMax, areaMin])

  const kpis = useMemo(() => ({
    inquilinos: new Set(matches.map(m => m.codigo_atendimento)).size,
    imoveis: new Set(matches.map(m => m.codigo_imovel)).size,
    pares: matches.length,
  }), [matches])

  return (
    <div className="p-4 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Matching · Nido"
        title="Carteira Paralela"
        subtitle="Inquilino procurando agora × imóvel disponível que não administramos. Ligue pro dono com o inquilino na mão e feche com administração."
      />

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <StatTile label="Inquilinos procurando" value={kpis.inquilinos} accent="var(--success)" sublabel="atendimentos ativos com match" />
        <StatTile label="Imóveis que casam" value={kpis.imoveis} accent="var(--chart-1)" sublabel="disponíveis, não administrados" />
        <StatTile label="Oportunidades" value={kpis.pares} accent="var(--chart-2)" sublabel="pares inquilino × imóvel" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder="Inquilino, dono, endereço, VK…" /></div>
        <Select value={bairro} onChange={setBairro} options={[{ value: ALL, label: 'Todos os bairros' }, ...bairros.map(b => ({ value: b, label: b }))]} />
        <Select value={tipoFiltro} onChange={setTipoFiltro} options={[{ value: ALL, label: 'Todos os tipos' }, ...tiposImovel.map(t => ({ value: t, label: t }))]} />
        <input type="number" placeholder="R$ mín" value={precoMin} onChange={e => setPrecoMin(e.target.value)}
          className="w-24 h-8 px-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <input type="number" placeholder="R$ máx" value={precoMax} onChange={e => setPrecoMax(e.target.value)}
          className="w-24 h-8 px-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <input type="number" placeholder="Área mín m²" value={areaMin} onChange={e => setAreaMin(e.target.value)}
          className="w-28 h-8 px-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <span className="text-xs text-muted-foreground ml-auto font-mono">{grupos.length} inquilinos · ordenado por maior VK</span>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhum inquilino com esses filtros.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map(g => <Grupo key={g.atendimento} g={g} />)}
        </div>
      )}
    </div>
  )
}

function Grupo({ g }: { g: Grupo }) {
  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--secondary)' }}>
        <p className="text-[13px] font-semibold text-foreground">
          🔎 {g.inquilino || 'Inquilino'} <span className="font-normal text-muted-foreground">procura</span> {g.tipo} <span className="font-normal text-muted-foreground">em</span> {g.bairro}
          {g.precoMax ? <span className="font-normal text-muted-foreground"> · até {fmtBRL(g.precoMax)}</span> : null}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{g.imoveis.length} imóvel(is) casam — ligue pro dono</p>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {g.imoveis.map(m => <Linha key={m.codigo_imovel} m={m} g={g} />)}
      </div>
    </div>
  )
}

function Linha({ m, g }: { m: Match; g: Grupo }) {
  const msg = `Olá! Tenho um inquilino procurando ${g.tipo ?? 'imóvel'} em ${g.bairro ?? 'Brasília'}${g.precoMax ? ` (até ${fmtBRL(g.precoMax)})` : ''}. Seu imóvel${m.endereco ? ` (${m.endereco})` : ''} encaixa no perfil — podemos alugar com a administração da TRK?`
  const wa = waLink(m.telefone, msg)
  const maps = mapsLink(m)
  return (
    <div className="grid grid-cols-[1.5fr_1.3fr_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-accent/30 transition-colors">
      <div className="min-w-0">
        <p className="text-[12px] text-foreground truncate font-mono"><span className="font-semibold">{m.codigo_imovel}</span>{m.endereco ? ` · ${m.endereco}` : ''}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {[m.tipo_imovel, n(m.area_util) ? `${Math.round(n(m.area_util)!)} m²` : null, m.qtd_dormitorios ? `${m.qtd_dormitorios} dorm` : null].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-foreground truncate">{m.proprietario ?? '—'}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">{m.telefone ?? 'sem telefone'}</p>
      </div>
      <div className="text-right">
        <p className="text-[13px] font-bold font-mono text-foreground tabular">{n(m.preco_locacao) ? fmtBRL(n(m.preco_locacao)!) : '—'}</p>
      </div>
      <div className="flex items-center gap-1.5 justify-end">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" title="Chamar dono no WhatsApp"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-85" style={{ background: 'var(--success)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.15L3 21l1.85-6.4A8 8 0 1121 12z" /></svg>
          </a>
        )}
        {maps && (
          <a href={maps} target="_blank" rel="noreferrer" title="Ver no mapa"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" style={{ border: '1px solid var(--border)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" /></svg>
          </a>
        )}
      </div>
    </div>
  )
}
