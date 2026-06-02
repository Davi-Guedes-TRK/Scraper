'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

const MatriculaMap = dynamic(() => import('../triagem/matricula-map').then(m => m.MatriculaMap), {
  ssr: false,
  loading: () => <div className="rounded-lg bg-muted animate-pulse" style={{ height: 280 }} />,
})

type Lead = {
  id: number
  lat: number | null; lng: number | null
  endereco: string | null; telefone: string | null
  tipo_imovel: string | null; obs: string | null
  foto_url: string | null; criado_em: string | null
}

const TIPOS = ['Apartamento', 'Casa', 'Comercial', 'Terreno', 'Kitnet', 'Outro']
type Toast = { id: number; msg: string; type: 'ok' | 'err' }

// Comprime/redimensiona a foto no cliente — fotos de celular têm 8–12 MP e estouram
// a memória do navegador ao subir cruas. Reduz pra ~1600px JPEG (de MBs p/ ~200–400 KB).
async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  // Decodifica JÁ reduzido (resize no decode) p/ não estourar a memória do celular com fotos de 8–12 MP.
  let bmp: ImageBitmap | null = null
  let img: HTMLImageElement | null = null
  try {
    bmp = await createImageBitmap(file, { resizeWidth: maxDim, resizeQuality: 'medium', imageOrientation: 'from-image' })
  } catch {
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = null }
  }
  if (!bmp) {
    const url = URL.createObjectURL(file)
    try {
      img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url
      })
    } finally { URL.revokeObjectURL(url) }
  }
  const w = bmp ? bmp.width : img!.naturalWidth
  const h = bmp ? bmp.height : img!.naturalHeight
  const scale = Math.min(1, maxDim / Math.max(w, h))
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas'); canvas.width = dw; canvas.height = dh
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas indisponível')
  ctx.drawImage((bmp ?? img)!, 0, 0, dw, dh)
  bmp?.close()
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
  if (!blob) throw new Error('falha ao comprimir')
  return blob
}

// Lê GPS do EXIF do JPEG original (sem lib). Retorna null se a foto não tiver geotag.
// (A compressão por canvas apaga o EXIF, então isto roda no arquivo original, antes.)
async function readExifGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xFFD8) return null // não é JPEG
    let off = 2, tiff = -1
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off)
      if ((marker & 0xFF00) !== 0xFF00) break
      const size = v.getUint16(off + 2)
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { tiff = off + 10; break } // "Exif"
      off += 2 + size
    }
    if (tiff < 0) return null
    const le = v.getUint16(tiff) === 0x4949
    if (v.getUint16(tiff + 2, le) !== 0x002A) return null
    const entries = (ifdOff: number) => {
      const m = new Map<number, { valOff: number; count: number }>()
      const base = tiff + ifdOff
      if (base + 2 > v.byteLength) return m
      const n = v.getUint16(base, le)
      for (let i = 0; i < n; i++) {
        const e = base + 2 + i * 12
        if (e + 12 > v.byteLength) break
        m.set(v.getUint16(e, le), { count: v.getUint32(e + 4, le), valOff: e + 8 })
      }
      return m
    }
    const gpsPtr = entries(v.getUint32(tiff + 4, le)).get(0x8825)
    if (!gpsPtr) return null
    const gps = entries(v.getUint32(gpsPtr.valOff, le))
    const ref = (tag: number) => { const e = gps.get(tag); return e ? String.fromCharCode(v.getUint8(e.valOff)).toUpperCase() : '' }
    const dms = (tag: number): number | null => {
      const e = gps.get(tag)
      if (!e || e.count < 3) return null
      const o = tiff + v.getUint32(e.valOff, le)
      const rat = (k: number) => { const num = v.getUint32(o + k, le), den = v.getUint32(o + k + 4, le); return den ? num / den : 0 }
      return rat(0) + rat(8) / 60 + rat(16) / 3600
    }
    const lat = dms(2), lng = dms(4)
    if (lat === null || lng === null) return null
    return { lat: ref(1) === 'S' ? -lat : lat, lng: ref(3) === 'W' ? -lng : lng }
  } catch { return null }
}

export function InLocoClient() {
  const [supabase] = useState(() => createClient())
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [endereco, setEndereco] = useState('')
  const [fonte, setFonte] = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [tipo, setTipo] = useState('')
  const [obs, setObs] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [locSource, setLocSource] = useState<'exif' | 'gps' | null>(null)
  const [locating, setLocating] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState<Lead[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const tid = useRef(0)

  const toast = useCallback((msg: string, type: Toast['type'] = 'ok') => {
    const id = ++tid.current
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const loadRecent = useCallback(() => {
    fetch('/api/in-loco').then(r => r.ok ? r.json() : []).then(setRecent).catch(() => {})
  }, [])
  useEffect(() => { loadRecent() }, [loadRecent])

  const geocode = useCallback(async (lat: number, lng: number) => {
    setGeocoding(true)
    try {
      const res = await fetch('/api/in-loco/geo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.endereco) { setEndereco(d.endereco); setFonte(d.fonte) }
      else { setFonte(null); toast(d.error ?? 'Sem endereço aqui — ajuste o pino ou digite', 'err') }
    } catch { toast('Erro ao buscar endereço', 'err') }
    finally { setGeocoding(false) }
  }, [toast])

  // Foto -> comprime no celular -> Supabase Storage (bucket "in-loco")
  const onPhoto = async (file: File) => {
    setUploading(true)
    // prioridade: GPS do EXIF da própria foto (lido do original, antes de comprimir)
    const exif = await readExifGps(file)
    if (exif) { setCoords(exif); setLocSource('exif'); geocode(exif.lat, exif.lng); toast('Localização lida da foto 📷') }
    try {
      const blob = await compressImage(file)
      setFotoPreview(URL.createObjectURL(blob))
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error } = await supabase.storage.from('in-loco').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('in-loco').getPublicUrl(path)
      setFotoUrl(data.publicUrl)
      toast('Foto enviada ✓')
    } catch (e) {
      setFotoUrl(null)
      toast(`Erro ao enviar foto${e instanceof Error ? `: ${e.message}` : ''}`, 'err')
    } finally { setUploading(false) }
  }

  const pegarLocalizacao = () => {
    if (!('geolocation' in navigator)) { toast('Sem GPS neste dispositivo', 'err'); return }
    setLocating(true); setFonte(null)
    navigator.geolocation.getCurrentPosition(
      pos => { const { latitude: lat, longitude: lng } = pos.coords; setCoords({ lat, lng }); setLocSource('gps'); setLocating(false); geocode(lat, lng) },
      err => { setLocating(false); toast(err.code === 1 ? 'Permissão de localização negada' : 'Não consegui o GPS', 'err') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  // arrastar o pino para o imóvel certo (ex.: do outro lado da rua) -> re-geocodifica
  const onPinDrag = (lat: number, lng: number) => { setCoords({ lat, lng }); geocode(lat, lng) }

  const limpar = () => {
    setCoords(null); setEndereco(''); setFonte(null); setTelefone(''); setTipo(''); setObs('')
    setFotoUrl(null); setFotoPreview(null); setLocSource(null)
  }

  const salvar = async () => {
    if (!endereco.trim()) { toast('Endereço é obrigatório', 'err'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/in-loco', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: coords?.lat ?? null, lng: coords?.lng ?? null, endereco: endereco.trim(),
          fonte, telefone: telefone.trim(), tipo_imovel: tipo, obs: obs.trim(), foto_url: fotoUrl,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(`Erro ao salvar: ${d.error ?? res.status}`, 'err'); return }
      toast('Imóvel salvo ✓'); limpar(); loadRecent()
    } catch { toast('Erro ao salvar', 'err') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 ring-ring/30 transition-all'
  const inputStyle = { background: 'var(--secondary)', border: '1px solid var(--border)' }

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">In Loco</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Foto + localização no local → endereço. Arraste o pino pro imóvel certo.</p>
      </div>

      {/* 1. foto */}
      <label className="rounded-xl overflow-hidden cursor-pointer block" style={{ border: '1px solid var(--border)' }}>
        <input type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f) }} />
        {fotoPreview ? (
          <div className="relative">
            <img src={fotoPreview} alt="imóvel" className="w-full h-44 object-cover" />
            <span className="absolute bottom-2 right-2 text-[10px] px-2 py-1 rounded-full text-white"
              style={{ background: uploading ? 'rgba(0,0,0,.6)' : fotoUrl ? 'rgba(22,163,74,.9)' : 'rgba(220,38,38,.9)' }}>
              {uploading ? 'enviando…' : fotoUrl ? 'foto ok ✓' : 'falhou'}
            </span>
          </div>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center gap-1 text-muted-foreground" style={{ background: 'var(--secondary)' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <span className="text-xs font-medium">Tirar foto do imóvel</span>
          </div>
        )}
      </label>

      {/* 2. localização */}
      <button onClick={pegarLocalizacao} disabled={locating || geocoding}
        className="w-full h-12 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        style={{ background: 'var(--primary)' }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" />
        </svg>
        {locating ? 'Pegando GPS…' : geocoding ? 'Buscando endereço…' : coords ? 'Pegar localização de novo' : 'Pegar localização'}
      </button>

      {coords && (
        <>
          <MatriculaMap lat={coords.lat} lng={coords.lng} onDragEnd={onPinDrag} />
          <p className="text-[11px] text-muted-foreground -mt-2 text-center">
            {locSource === 'exif' ? '📷 local da foto · ' : locSource === 'gps' ? '📍 sua localização · ' : ''}
            Arraste o pino pro imóvel certo (mesmo do outro lado da rua). {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        </>
      )}

      {/* 3. dados */}
      <div className="flex flex-col gap-3 rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div>
          <label className="text-[11px] font-semibold text-foreground flex items-center gap-2 mb-1">
            Endereço <span className="text-destructive">*</span>
            {fonte && <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{fonte}</span>}
          </label>
          <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Pegue o GPS / ajuste o pino ou digite" className={inputCls} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1">Telefone</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} type="tel" placeholder="da placa" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">—</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-foreground block mb-1">Observações</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="ex: placa Imobiliária X, prédio antigo…" className={`${inputCls} resize-none`} style={inputStyle} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={limpar} disabled={saving} className="px-4 h-11 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:text-foreground transition-colors disabled:opacity-40">Limpar</button>
          <button onClick={salvar} disabled={saving || uploading || !endereco.trim()} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors" style={{ background: 'var(--primary)' }}>
            {saving ? 'Salvando…' : 'Salvar imóvel'}
          </button>
        </div>
      </div>

      {/* 4. recentes */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-muted-foreground/50">Capturados recentemente ({recent.length})</p>
          {recent.slice(0, 20).map(l => (
            <div key={l.id} className="rounded-lg overflow-hidden flex items-center gap-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              {l.foto_url
                ? <img src={l.foto_url} alt="" className="w-14 h-14 object-cover flex-shrink-0" />
                : <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center text-muted-foreground/30" style={{ background: 'var(--muted)' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                  </div>}
              <div className="min-w-0 py-2 pr-2">
                <p className="text-sm text-foreground font-medium leading-snug truncate">{l.endereco}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {[l.tipo_imovel, l.telefone].filter(Boolean).join(' · ') || '—'}
                  {l.lat && l.lng && <> · <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}>mapa ↗</a></>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white ${t.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
