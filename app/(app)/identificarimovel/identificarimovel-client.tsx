'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

type Tipo = 'fachada' | 'satelite' | 'telhado' | 'piscina' | 'outro'
type Confianca = 'alta' | 'media' | 'baixa'

type Ranking = {
  endereco: string
  endereco_wfs: string | null
  ref_id: string
  ref_foto_url: string
  confianca: Confianca
  motivo: string
}

type Resposta = {
  total_refs: number
  tipo_detectado?: string
  ranking: Ranking[]
  observacoes: string | null
  error?: string
}

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'fachada',  label: '🏠 Fachada'  },
  { value: 'satelite', label: '🛰️ Satélite' },
  { value: 'telhado',  label: '🏘️ Telhado'  },
  { value: 'piscina',  label: '💧 Piscina'  },
]

const COR_CONFIANCA: Record<Confianca, string> = {
  alta:  'bg-primary/15 text-primary border-primary/30',
  media: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  baixa: 'bg-muted text-muted-foreground border-border',
}

export function IdentificarImovelClient() {
  const [foto, setFoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rua, setRua] = useState('')
  const [tipo, setTipo] = useState<Tipo | ''>('')
  const [ruasDisponiveis, setRuasDisponiveis] = useState<string[]>([])
  const [identificando, setIdentificando] = useState(false)
  const [resposta, setResposta] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!foto) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(foto)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  useEffect(() => {
    fetch('/api/referencias-visuais')
      .then(r => r.json())
      .then((d: { referencias?: { rua: string }[] }) => {
        const ruas = Array.from(new Set((d.referencias ?? []).map(r => r.rua))).sort((a, b) => a.localeCompare(b))
        setRuasDisponiveis(ruas)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) {
            const ext = f.type.split('/')[1] || 'png'
            setFoto(new File([f], `teste-${Date.now()}.${ext}`, { type: f.type }))
            e.preventDefault()
            break
          }
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  function onDropFoto(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) setFoto(f)
  }

  function onPasteZona(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) {
          setFoto(new File([f], `teste-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))
          e.preventDefault()
          return
        }
      }
    }
  }

  async function identificar() {
    if (!foto) { setErro('Selecione uma foto'); return }
    setErro(null)
    setResposta(null)
    setIdentificando(true)

    try {
      const form = new FormData()
      form.append('foto', foto)
      if (rua)  form.append('rua', rua)
      if (tipo) form.append('tipo', tipo)

      const r = await fetch('/api/identificar-imovel', { method: 'POST', body: form })
      const data = await r.json() as Resposta
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`)
      setResposta(data)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIdentificando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="TRK Visual"
        title="Identificar Imóvel"
        subtitle="Testa o sistema: cola uma foto e veja qual referência o Gemini acha que bate"
      />

      <section className="border border-border rounded-lg bg-background p-5 mb-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Rua (opcional, restringe a busca)</label>
            <select
              value={rua}
              onChange={e => setRua(e.target.value)}
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none"
            >
              <option value="">Todas as ruas</option>
              {ruasDisponiveis.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo da foto (opcional)</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as Tipo | '')}
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none"
            >
              <option value="">Auto (compara contra todos os tipos)</option>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <label
          tabIndex={0}
          onPaste={onPasteZona}
          onDragOver={e => e.preventDefault()}
          onDrop={onDropFoto}
          className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-4 cursor-pointer hover:border-trk-blue focus:border-trk-blue focus:outline-none transition-colors min-h-[120px]"
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => setFoto(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="teste" className="h-28 rounded border border-border object-cover" />
              <div className="text-xs">
                <p className="text-foreground">{foto?.name}</p>
                <p className="text-muted-foreground">{foto ? `${Math.round(foto.size / 1024)} KB` : ''}</p>
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setFoto(null); setResposta(null) }}
                  className="text-danger hover:underline mt-1 cursor-pointer"
                >
                  remover
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground/60 block">CTRL + V</span>
              cole, arraste ou clique aqui pra escolher
            </div>
          )}
        </label>

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs">
            {erro && <span className="text-danger">{erro}</span>}
          </div>
          <Button onClick={identificar} disabled={!foto || identificando}>
            {identificando ? 'Identificando…' : 'Identificar'}
          </Button>
        </div>
      </section>

      {resposta && (
        <section className="border border-border rounded-lg bg-background p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Resultado <span className="text-muted-foreground font-normal">({resposta.ranking.length} candidatos de {resposta.total_refs} refs)</span>
            </h2>
            {resposta.tipo_detectado && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded text-muted-foreground">
                tipo: {resposta.tipo_detectado}
              </span>
            )}
          </div>

          {resposta.observacoes && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">{resposta.observacoes}</p>
          )}

          {resposta.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum candidato plausível.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {resposta.ranking.map((c, i) => (
                <div key={c.ref_id} className="flex items-start gap-3 p-3 border border-border rounded-md">
                  <div className="text-2xl font-mono text-muted-foreground w-6 text-center">#{i + 1}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.ref_foto_url} alt="ref" className="h-24 w-32 rounded border border-border object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.endereco}</p>
                    {c.endereco_wfs && (
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">WFS: {c.endereco_wfs}</p>
                    )}
                    <p className="text-xs text-foreground/80 mt-1">{c.motivo}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded ${COR_CONFIANCA[c.confianca]}`}>
                    {c.confianca}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
