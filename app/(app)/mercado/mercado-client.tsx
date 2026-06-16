'use client'

// Dashboard do mercado imobiliário: ações do setor (B3) + macro (BCB).
// Objetivo: identificar ALTAS no setor. Polling /api/mercado a cada 5 min.

import { useEffect, useState } from 'react'

type Acao = {
  symbol: string; nome: string; grupo: 'Construtora' | 'Shopping/Renda' | 'Índice'
  preco: number | null; variacao: number | null; spark: number[]
}
type Indicador = { chave: string; label: string; valor: number | null; unidade: string; data: string | null; nota: string }
type Mercado = {
  atualizado: string; ibovespa: Acao | null; setorMedia: number | null
  acoes: Acao[]; indicadores: Indicador[]
}

const VERDE = '#16a34a'
const VERMELHO = '#dc2626'
const cor = (v: number | null | undefined) => (v == null ? 'var(--muted-foreground)' : v >= 0 ? VERDE : VERMELHO)
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)
const fmtPreco = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div className="w-20 h-7" />
  const min = Math.min(...data), max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 80},${28 - ((v - min) / span) * 26}`).join(' ')
  const c = up ? VERDE : VERMELHO
  return (
    <svg width="80" height="28" className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function useMercado() {
  const [data, setData] = useState<Mercado | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    const carregar = async () => {
      try {
        const r = await fetch('/api/mercado', { cache: 'no-store' })
        if (!r.ok) throw new Error()
        const d = await r.json()
        if (vivo) { setData(d); setErro(false) }
      } catch { if (vivo) setErro(true) }
    }
    carregar()
    const t = setInterval(carregar, 300_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  return { data, erro }
}

export function MercadoClient() {
  const { data, erro } = useMercado()
  const ibov = data?.ibovespa
  const altas = data?.acoes.filter(a => (a.variacao ?? 0) > 0).length ?? 0

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Mercado Imobiliário</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Setor da construção e shoppings na B3 + indicadores que mexem com imóvel</p>
        </div>
        <div className="flex items-center gap-4">
          {ibov && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Ibovespa</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: cor(ibov.variacao) }}>
                {fmtPreco(ibov.preco)} <span className="text-xs">{fmtPct(ibov.variacao)}</span>
              </p>
            </div>
          )}
          {data?.setorMedia != null && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Setor hoje</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: cor(data.setorMedia) }}>{fmtPct(data.setorMedia)}</p>
            </div>
          )}
        </div>
      </div>

      {erro && !data && (
        <div className="rounded-lg p-3 text-sm border" style={{ borderColor: 'color-mix(in srgb, #dc2626 30%, transparent)', background: 'color-mix(in srgb, #dc2626 8%, var(--card))', color: VERMELHO }}>
          Não consegui carregar as cotações agora. Tentando de novo em instantes…
        </div>
      )}

      {/* Macro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {(data?.indicadores ?? Array.from({ length: 4 })).map((ind: Indicador | undefined, i) => (
          <div key={ind?.chave ?? i} className="rounded-xl border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{ind?.label ?? '—'}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1 leading-none">
              {ind?.valor != null ? ind.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}
              <span className="text-xs font-medium text-muted-foreground ml-1">{ind?.unidade}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{ind?.nota}</p>
            {ind?.data && <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">ref. {ind.data}</p>}
          </div>
        ))}
      </div>

      {/* Ações do setor — ordenadas por maiores altas */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold text-foreground">Setor imobiliário · B3</h2>
          <span className="text-[11px] text-muted-foreground font-mono">{altas}/{data?.acoes.length ?? 0} em alta · maiores altas no topo</span>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {(data?.acoes ?? Array.from({ length: 8 })).map((a: Acao | undefined, i) => {
            const up = (a?.variacao ?? 0) >= 0
            return (
              <div key={a?.symbol ?? i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-14 flex-shrink-0">
                  <span className="text-xs font-bold font-mono text-foreground">{a?.symbol ?? '—'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground truncate leading-tight">{a?.nome ?? '—'}</p>
                  <span className="text-[9px] px-1 py-0.5 rounded font-mono uppercase leading-none"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{a?.grupo ?? ''}</span>
                </div>
                <Sparkline data={a?.spark ?? []} up={up} />
                <div className="w-20 text-right flex-shrink-0">
                  <p className="text-[13px] font-semibold text-foreground tabular-nums leading-tight">{fmtPreco(a?.preco)}</p>
                  <p className="text-xs font-bold tabular-nums" style={{ color: cor(a?.variacao) }}>{fmtPct(a?.variacao)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 mt-3 text-center" suppressHydrationWarning>
        cotações via Yahoo Finance · macro via Banco Central (BCB) · atualiza a cada 5 min
        {data && ` · últ. ${new Date(data.atualizado).toLocaleTimeString('pt-BR')}`}
      </p>
    </div>
  )
}
