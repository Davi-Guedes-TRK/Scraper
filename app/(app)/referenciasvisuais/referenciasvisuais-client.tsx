'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

type Tipo = 'fachada' | 'satelite' | 'telhado' | 'piscina' | 'outro'

type Referencia = {
  id: string
  rua: string
  lat: number
  lng: number
  endereco_conhecido: string
  endereco_wfs:   string | null
  endereco_cart:  string | null
  wfs_aproximado: boolean
  wfs_dados:      Record<string, unknown> | null
  foto_url: string
  foto_path: string
  tipo: Tipo
  observacoes: string | null
  criado_em: string
}

const TIPOS: { value: Tipo; label: string; emoji: string }[] = [
  { value: 'fachada',  label: 'Fachada',  emoji: '🏠' },
  { value: 'satelite', label: 'Satélite', emoji: '🛰️' },
  { value: 'telhado',  label: 'Telhado',  emoji: '🏘️' },
  { value: 'piscina',  label: 'Piscina',  emoji: '💧' },
  { value: 'outro',    label: 'Outro',    emoji: '📷' },
]

// Normaliza endereço pra comparação: trim, uppercase, "Conjunto"→"CJ", "Casa"→"LT"
function normalizarEndereco(s: string | null): string {
  if (!s) return ''
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bCONJUNTO\b/g, 'CJ')
    .replace(/\bCASA\b/g, 'LT')
    .replace(/\bLOTE\b/g, 'LT')
    .replace(/\s+/g, ' ')
    .trim()
}

function extrairCoords(input: string): { lat: number; lng: number } | null {
  const s = input.trim()
  if (!s) return null

  let m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  m = s.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  m = s.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }

  return null
}

function extrairEndereco(input: string): string | null {
  const m = input.match(/\/place\/([^/]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || null
  } catch {
    return null
  }
}

export function ReferenciasVisuaisClient() {
  const [referencias, setReferencias] = useState<Referencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroRua, setFiltroRua] = useState('')

  // Form state
  const [rua, setRua] = useState('')
  const [urlMaps, setUrlMaps] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [enderecoConhecido, setEnderecoConhecido] = useState('')
  const [tipo, setTipo] = useState<Tipo>('fachada')
  const [foto, setFoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    const c = extrairCoords(urlMaps)
    if (c) {
      setLat(String(c.lat))
      setLng(String(c.lng))
    }
    const e = extrairEndereco(urlMaps)
    if (e) setEnderecoConhecido(prev => prev || e)
  }, [urlMaps])

  useEffect(() => {
    if (!foto) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(foto)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (f) {
            const ext = f.type.split('/')[1] || 'png'
            const named = new File([f], `colado-${Date.now()}.${ext}`, { type: f.type })
            setFoto(named)
            e.preventDefault()
            break
          }
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  function onPasteNaZona(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) {
          const ext = f.type.split('/')[1] || 'png'
          const named = new File([f], `colado-${Date.now()}.${ext}`, { type: f.type })
          setFoto(named)
          e.preventDefault()
          break
        }
      }
    }
  }

  function onDropFoto(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) setFoto(f)
  }

  async function carregar() {
    setCarregando(true)
    try {
      const r = await fetch('/api/referencias-visuais')
      const data = await r.json() as { referencias?: Referencia[]; error?: string }
      setReferencias(data.referencias ?? [])
    } finally {
      setCarregando(false)
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOkMsg(null)

    if (!foto)              return setErro('Selecione uma foto')
    if (!rua.trim())        return setErro('Informe a rua')
    if (!enderecoConhecido.trim()) return setErro('Informe o endereço conhecido')
    if (!lat || !lng)       return setErro('Informe coordenadas (cole URL do Maps ou digite)')

    setSalvando(true)
    try {
      const form = new FormData()
      form.append('foto', foto)
      form.append('rua', rua.trim())
      form.append('lat', lat)
      form.append('lng', lng)
      form.append('endereco_conhecido', enderecoConhecido.trim())
      form.append('tipo', tipo)
      if (observacoes.trim()) form.append('observacoes', observacoes.trim())

      const r = await fetch('/api/referencias-visuais', { method: 'POST', body: form })
      const data = await r.json() as { referencia?: Referencia; error?: string }
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`)

      setOkMsg('Salvo ✓')
      setFoto(null)
      setUrlMaps('')
      setLat('')
      setLng('')
      setEnderecoConhecido('')
      setObservacoes('')
      const fileInput = document.getElementById('foto-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    if (!confirm('Remover essa referência?')) return
    const r = await fetch(`/api/referencias-visuais/${id}`, { method: 'DELETE' })
    if (r.ok) await carregar()
  }

  const ruasUnicas = useMemo(
    () => Array.from(new Set(referencias.map(r => r.rua))).sort(),
    [referencias],
  )

  const filtradas = useMemo(
    () => filtroRua ? referencias.filter(r => r.rua === filtroRua) : referencias,
    [referencias, filtroRua],
  )

  const grupos = useMemo(() => {
    const map = new Map<string, Referencia[]>()
    for (const r of filtradas) {
      const k = r.endereco_conhecido
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtradas])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="TRK Visual"
        title="Referências Visuais"
        subtitle="Banco de fotos+endereços pra identificar imóveis pela imagem"
      />

      <section className="border border-border rounded-lg bg-background p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3 text-foreground">Nova referência</h2>

        <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Rua (agrupador)</label>
            <input
              list="ruas"
              value={rua}
              onChange={e => setRua(e.target.value)}
              placeholder="ex: SHIS QI 17 Conjunto 4"
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none focus:border-trk-blue"
              required
            />
            <datalist id="ruas">
              {ruasUnicas.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">
              URL do Google Maps <span className="text-muted-foreground/60">(ou cole "lat, lng" abaixo)</span>
            </label>
            <input
              value={urlMaps}
              onChange={e => setUrlMaps(e.target.value)}
              placeholder="https://www.google.com/maps/@-15.836,-47.857,..."
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm font-mono outline-none focus:border-trk-blue"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Latitude</label>
            <input
              value={lat}
              onChange={e => setLat(e.target.value)}
              placeholder="-15.836"
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm font-mono outline-none focus:border-trk-blue"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Longitude</label>
            <input
              value={lng}
              onChange={e => setLng(e.target.value)}
              placeholder="-47.857"
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm font-mono outline-none focus:border-trk-blue"
              required
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Endereço conhecido</label>
            <input
              value={enderecoConhecido}
              onChange={e => setEnderecoConhecido(e.target.value)}
              placeholder="ex: SHIS QI 17 Conjunto 4 Casa 8"
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none focus:border-trk-blue"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as Tipo)}
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none focus:border-trk-blue"
            >
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">
              Foto <span className="text-muted-foreground/60">(cole com Ctrl+V, arraste, ou clique pra escolher)</span>
            </label>
            <label
              tabIndex={0}
              onPaste={onPasteNaZona}
              onDragOver={e => e.preventDefault()}
              onDrop={onDropFoto}
              className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-3 cursor-pointer hover:border-trk-blue focus:border-trk-blue focus:outline-none transition-colors min-h-[88px]"
            >
              <input
                id="foto-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setFoto(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="preview" className="h-20 rounded border border-border object-cover" />
                  <div className="text-xs">
                    <p className="text-foreground">{foto?.name}</p>
                    <p className="text-muted-foreground">
                      {foto ? `${Math.round(foto.size / 1024)} KB · ${foto.type}` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setFoto(null) }}
                      className="text-danger hover:underline mt-1 cursor-pointer"
                    >
                      remover
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground text-center">
                  <span className="font-mono text-[10px] tracking-widest text-muted-foreground/60 block">CTRL + V</span>
                  cole, arraste ou clique aqui
                </div>
              )}
            </label>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-muted-foreground mb-1">Observações <span className="text-muted-foreground/60">(opcional)</span></label>
            <input
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="ex: piscina em L, telhado vermelho"
              className="w-full px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none focus:border-trk-blue"
            />
          </div>

          <div className="col-span-2 flex items-center justify-between mt-1">
            <div className="text-xs">
              {erro   && <span className="text-danger">{erro}</span>}
              {okMsg  && <span className="text-primary">{okMsg}</span>}
            </div>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar referência'}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Cadastradas <span className="text-muted-foreground font-normal">({referencias.length})</span>
          </h2>
          {ruasUnicas.length > 0 && (
            <select
              value={filtroRua}
              onChange={e => setFiltroRua(e.target.value)}
              className="px-3 py-1.5 border border-border bg-background rounded-md text-sm outline-none"
            >
              <option value="">Todas as ruas</option>
              {ruasUnicas.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!carregando && grupos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma referência ainda.</p>
        )}

        <div className="flex flex-col gap-4">
          {grupos.map(([endereco, fotos]) => {
            const enderecoNorm = normalizarEndereco(endereco)
            const wfsBateu = fotos.some(f => normalizarEndereco(f.endereco_wfs) === enderecoNorm)
            const wfsDiff  = fotos.some(f => f.endereco_wfs && normalizarEndereco(f.endereco_wfs) !== enderecoNorm)
            const aproximado = fotos.some(f => f.wfs_aproximado)
            const primeira = fotos[0]
            return (
              <div key={endereco} className="border border-border rounded-lg bg-background p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{endereco}</p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {primeira.lat}, {primeira.lng} · {primeira.rua}
                    </p>
                    <p className="text-[11px] mt-1">
                      <span className="text-muted-foreground">WFS (SITURB): </span>
                      {primeira.endereco_wfs
                        ? <>
                            <span className={wfsBateu ? 'text-primary' : wfsDiff ? 'text-amber-600' : ''}>
                              {primeira.endereco_wfs}
                            </span>
                            {aproximado && (
                              <span className="ml-1 text-amber-600" title="WFS não bateu ponto-no-polígono, usou lote mais próximo">≈ aproximado</span>
                            )}
                          </>
                        : <span className="text-muted-foreground/70">não retornou lote</span>
                      }
                    </p>
                    {primeira.endereco_cart && (
                      <p className="text-[11px] mt-0.5">
                        <span className="text-muted-foreground">WFS (cart.): </span>
                        <span className="text-muted-foreground font-mono">{primeira.endereco_cart}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {fotos.map(f => {
                    const t = TIPOS.find(x => x.value === f.tipo)
                    return (
                      <div key={f.id} className="relative group">
                        <a href={f.foto_url} target="_blank" rel="noopener" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.foto_url}
                            alt={f.tipo}
                            className="w-full h-32 object-cover rounded-md border border-border"
                          />
                        </a>
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-background/90 border border-border rounded text-[10px]">
                          {t?.emoji} {t?.label}
                        </div>
                        <button
                          onClick={() => remover(f.id)}
                          className="absolute top-1 right-1 px-1.5 py-0.5 bg-background/90 border border-border rounded text-[10px] text-danger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remover"
                        >
                          ×
                        </button>
                        {f.observacoes && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate" title={f.observacoes}>{f.observacoes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
