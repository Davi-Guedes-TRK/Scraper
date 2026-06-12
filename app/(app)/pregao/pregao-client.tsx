'use client'

// PREGÃO — o funil de captação como um terminal de bolsa (CRT verde-fósforo).
// Polling em /api/pregao a cada 30s. Visual auto-contido: o painel é sempre
// escuro (terminal), independente do tema do app.

import { useEffect, useRef, useState } from 'react'
import { parsePreco, fmtBRL } from '@/lib/formatters'
import { portalLabel } from '@/lib/portals'
import type { PregaoData } from '@/app/api/pregao/route'

const VERDE = '#2bd97c'
const VERDE_FRACO = 'rgba(43,217,124,.55)'
const VERMELHO = '#ff4d5e'
const AMBAR = '#ffb224'
const GRADE = 'rgba(43,217,124,.13)'

function useRelogio() {
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => {
    setAgora(new Date())
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return agora
}

function usePregao() {
  const [data, setData] = useState<PregaoData | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    const carregar = async () => {
      try {
        const r = await fetch('/api/pregao', { cache: 'no-store' })
        if (!r.ok) throw new Error()
        const d = await r.json()
        if (vivo) { setData(d); setErro(false) }
      } catch { if (vivo) setErro(true) }
    }
    carregar()
    const t = setInterval(carregar, 30_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  return { data, erro }
}

const nf = new Intl.NumberFormat('pt-BR')

function precoCurto(preco: string | null): string {
  const v = parsePreco(preco)
  if (!v) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`
  return String(v)
}

// ── Peças ──────────────────────────────────────────────────────────────────────

function Etapa({ rotulo, valor, sub, cor = VERDE, fraca = false }: {
  rotulo: string; valor: number; sub?: string | null; cor?: string; fraca?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 min-w-0" style={{ borderLeft: `1px solid ${GRADE}` }}>
      <span className="pregao-rotulo" style={{ color: VERDE_FRACO }}>{rotulo}</span>
      <span
        className="font-mono font-semibold leading-none tabular-nums"
        style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.6rem)', color: fraca ? VERDE_FRACO : cor, textShadow: fraca ? 'none' : `0 0 18px ${cor}44` }}
      >
        {nf.format(valor)}
      </span>
      <span className="font-mono text-[10px] h-3" style={{ color: 'rgba(255,255,255,.38)' }}>{sub ?? ''}</span>
    </div>
  )
}

function Indice({ rotulo, valor, delta }: { rotulo: string; valor: string; delta?: number | null }) {
  const sobe = (delta ?? 0) >= 0
  return (
    <div className="flex items-baseline gap-2 px-4 py-2 whitespace-nowrap" style={{ borderLeft: `1px solid ${GRADE}` }}>
      <span className="pregao-rotulo" style={{ color: VERDE_FRACO }}>{rotulo}</span>
      <span className="font-mono text-sm font-semibold tabular-nums text-white">{valor}</span>
      {delta != null && (
        <span className="font-mono text-[11px] tabular-nums" style={{ color: sobe ? VERDE : VERMELHO }}>
          {sobe ? '▲' : '▼'}{Math.abs(delta)}%
        </span>
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

export function PregaoClient() {
  const { data, erro } = usePregao()
  const agora = useRelogio()
  const ultimaSync = useRef<string | null>(null)
  if (data) ultimaSync.current = data.agora

  const f = data?.funil
  const i = data?.indices
  const deltaSemana = i && i.d7_prev >= 10 ? Math.round(((i.d7 - i.d7_prev) / i.d7_prev) * 100) : null
  const certidoes = i ? i.mat_solicitadas_total + i.onus_solicitadas_total : 0
  const custoPorContato = i && i.contatos_total > 0 ? (certidoes / i.contatos_total).toFixed(1) : null
  const maxVol = Math.max(1, ...(data?.volume14d.map(v => v.n) ?? [1]))

  return (
    <div className="p-4 md:p-6">
      <style>{`
        .pregao-rotulo { font-family: 'Barlow Condensed', 'Manrope', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
        @keyframes pregao-fita { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .pregao-fita { animation: pregao-fita 55s linear infinite; }
        .pregao-fita:hover { animation-play-state: paused; }
        @keyframes pregao-pulso { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        .pregao-pulso { animation: pregao-pulso 1.6s ease-in-out infinite; }
        @keyframes pregao-cursor { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
        .pregao-cursor { animation: pregao-cursor 1.1s step-start infinite; }
      `}</style>

      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          background: 'radial-gradient(120% 90% at 50% 0%, #0c1a12 0%, #060d09 60%, #040806 100%)',
          border: `1px solid ${GRADE}`,
          boxShadow: 'inset 0 0 80px rgba(43,217,124,.05), 0 18px 50px rgba(0,0,0,.45)',
        }}
      >
        {/* scanlines do CRT */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-[.07]"
          style={{ background: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 3px)' }}
        />

        {/* ── Cabeçalho ── */}
        <header className="relative z-20 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3" style={{ borderBottom: `1px solid ${GRADE}` }}>
          <h1
            className="m-0 leading-none"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '1.7rem', letterSpacing: '.06em', color: VERDE, textShadow: `0 0 22px ${VERDE}55` }}
          >
            PREGÃO<span style={{ color: 'rgba(255,255,255,.85)' }}> · CAPTAÇÃO TRK</span>
          </h1>
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-widest" style={{ color: VERDE }}>
            <span className="pregao-pulso inline-block w-2 h-2 rounded-full" style={{ background: erro ? VERMELHO : VERDE, boxShadow: `0 0 8px ${erro ? VERMELHO : VERDE}` }} />
            {erro ? 'SEM SINAL' : 'AO VIVO'}
          </span>
          <div className="ml-auto flex items-baseline gap-4 font-mono tabular-nums">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>
              {agora?.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
            </span>
            <span className="text-xl font-semibold text-white" suppressHydrationWarning>
              {agora?.toLocaleTimeString('pt-BR') ?? '--:--:--'}
              <span className="pregao-cursor" style={{ color: VERDE }}>▮</span>
            </span>
          </div>
        </header>

        {/* ── Fita (ticker) ── */}
        <div className="relative z-20 overflow-hidden py-1.5" style={{ borderBottom: `1px solid ${GRADE}`, background: 'rgba(0,0,0,.35)' }}>
          {data && data.ticker.length > 0 ? (
            <div className="pregao-fita flex w-max gap-8 font-mono text-[12px] whitespace-nowrap">
              {[...data.ticker, ...data.ticker].map((t, idx) => (
                <a key={idx} href={t.link} target="_blank" rel="noreferrer" className="flex items-baseline gap-2 hover:underline">
                  <span style={{ color: VERDE }}>▲</span>
                  <span className="uppercase" style={{ color: 'rgba(255,255,255,.85)' }}>{(t.regiao ?? t.titulo ?? '—').slice(0, 34)}</span>
                  <span className="font-semibold tabular-nums" style={{ color: VERDE }}>{precoCurto(t.preco)}</span>
                  <span className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,.35)' }}>{portalLabel(t.portal)}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[12px] px-4" style={{ color: 'rgba(255,255,255,.35)' }}>
              {data ? 'sem leads novos hoje — a fita liga quando os scrapers postarem' : 'sintonizando…'}
            </div>
          )}
        </div>

        {/* ── Índices ── */}
        <div className="relative z-20 flex flex-wrap" style={{ borderBottom: `1px solid ${GRADE}` }}>
          <Indice rotulo="Leads hoje" valor={i ? nf.format(i.hoje) : '—'} />
          <Indice rotulo="7 dias" valor={i ? nf.format(i.d7) : '—'} delta={deltaSemana} />
          <Indice rotulo="Matrículas recebidas" valor={i ? `${nf.format(i.mat_recebidas_total)}/${nf.format(i.mat_solicitadas_total)}` : '—'} />
          <Indice rotulo="Certidões pedidas" valor={i ? nf.format(certidoes) : '—'} />
          <Indice rotulo="Contatos gerados" valor={i ? nf.format(i.contatos_total) : '—'} />
          {custoPorContato && <Indice rotulo="Certidões/contato" valor={custoPorContato} />}
        </div>

        {/* ── Book do funil ── */}
        <div className="relative z-20 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8" style={{ borderBottom: `1px solid ${GRADE}` }}>
          <Etapa rotulo="Na fila" valor={f?.na_fila ?? 0} fraca />
          <Etapa rotulo="Aprovados" valor={f?.aprovados ?? 0} />
          <Etapa rotulo="Matrícula pedida" valor={f?.mat_enviada ?? 0} sub={f?.espera_matricula_dias != null ? `espera ~${f.espera_matricula_dias}d` : null} />
          <Etapa rotulo="Matrícula OK" valor={f?.mat_recebida ?? 0} />
          <div className="flex flex-col justify-center gap-1.5 px-4 py-3" style={{ borderLeft: `1px solid ${GRADE}` }}>
            <span className="pregao-rotulo" style={{ color: VERDE_FRACO }}>Gate dedup</span>
            <div className="flex flex-col gap-0.5 font-mono text-[12px] tabular-nums">
              <span style={{ color: VERMELHO }}>● já na base <b>{f?.dedup_ja_na_base ?? 0}</b></span>
              <span style={{ color: AMBAR }}>● conferir <b>{f?.dedup_conferir ?? 0}</b></span>
              <span style={{ color: VERDE }}>● liberado <b>{f?.dedup_liberado ?? 0}</b></span>
            </div>
          </div>
          <Etapa rotulo="Ônus pedida" valor={f?.onus_enviada ?? 0} sub={f?.espera_onus_dias != null ? `espera ~${f.espera_onus_dias}d` : null} />
          <Etapa rotulo="Ônus OK" valor={f?.onus_recebida ?? 0} />
          <Etapa rotulo="Contato OK" valor={f?.contato_ok ?? 0} cor={AMBAR} />
        </div>

        {/* ── Blotter + volume ── */}
        <div className="relative z-20 grid lg:grid-cols-[1.4fr_1fr]">
          <section className="px-5 py-4 min-w-0" style={{ borderRight: `1px solid ${GRADE}` }}>
            <h2 className="pregao-rotulo m-0 mb-2" style={{ color: VERMELHO }}>⏸ Parados — exige ação</h2>
            {!data ? (
              <p className="font-mono text-[12px]" style={{ color: 'rgba(255,255,255,.35)' }}>carregando…</p>
            ) : data.parados.length === 0 ? (
              <p className="font-mono text-[12px]" style={{ color: VERDE_FRACO }}>nada parado &gt;7d — pipeline fluindo ✓</p>
            ) : (
              <table className="w-full font-mono text-[12px]">
                <tbody>
                  {data.parados.map((p, idx) => (
                    <tr key={idx} style={{ borderTop: idx ? `1px solid ${GRADE}` : 'none' }}>
                      <td className="py-1.5 pr-2 text-[10px] uppercase whitespace-nowrap" style={{ color: AMBAR }}>{p.tipo}</td>
                      <td className="py-1.5 pr-2 truncate max-w-0 w-full" style={{ color: 'rgba(255,255,255,.8)' }}>{p.endereco}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: p.dias >= 14 ? VERMELHO : AMBAR }}>{p.dias}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="px-5 py-4">
            <h2 className="pregao-rotulo m-0 mb-3" style={{ color: VERDE_FRACO }}>Volume — 14 dias</h2>
            <div className="flex items-end gap-[3px] h-28">
              {(data?.volume14d ?? []).map((v) => (
                <div key={v.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${v.dia}: ${v.n}`}>
                  <span className="font-mono text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,.45)' }}>{v.n}</span>
                  <div
                    className="w-full rounded-t-[2px]"
                    style={{
                      height: `${Math.max(3, (v.n / maxVol) * 88)}px`,
                      background: `linear-gradient(180deg, ${VERDE} 0%, rgba(43,217,124,.25) 100%)`,
                      boxShadow: `0 0 10px ${VERDE}33`,
                    }}
                  />
                  <span className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,.3)' }}>{v.dia.slice(8)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Rodapé ── */}
        <footer className="relative z-20 flex items-center justify-between px-5 py-2 font-mono text-[10px]" style={{ borderTop: `1px solid ${GRADE}`, color: 'rgba(255,255,255,.3)' }}>
          <span>fonte: imoveis_todos · onus_pipeline · espelho dw_trk (sync 8h30)</span>
          <span suppressHydrationWarning>
            últ. sync {ultimaSync.current ? new Date(ultimaSync.current).toLocaleTimeString('pt-BR') : '—'} · atualiza a cada 30s
          </span>
        </footer>
      </div>
    </div>
  )
}
