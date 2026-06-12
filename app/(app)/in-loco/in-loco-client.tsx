'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS = ['Casa', 'Apartamento', 'Comercial', 'Terreno', 'Outro']
type Toast = { id: number; msg: string; type: 'ok' | 'err' }

// ───────────────────────── foto: comprime no celular (fotos de 8–12 MP estouram a memória) ──
async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
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

// GPS do EXIF do JPEG (fallback quando o GPS ao vivo ainda não fixou). Sem lib.
async function readExifGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xFFD8) return null
    let off = 2, tiff = -1
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off)
      if ((marker & 0xFF00) !== 0xFF00) break
      const size = v.getUint16(off + 2)
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { tiff = off + 10; break }
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

// ───────────────────────── fila offline (IndexedDB) — captura nunca falha por falta de sinal ──
const IDB_NAME = 'inloco', IDB_STORE = 'fila'
type QItem = { cid: string; blob: Blob; lat: number | null; lng: number | null; tipo: string; createdAt: number }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE, { keyPath: 'cid' }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}
const qAdd = async (i: QItem) => tx(await openDB(), 'readwrite', s => s.put(i))
const qAll = async (): Promise<QItem[]> => tx<QItem[]>(await openDB(), 'readonly', s => s.getAll())
const qDel = async (cid: string) => tx(await openDB(), 'readwrite', s => s.delete(cid))

type Captura = {
  cid: string
  status: 'fila' | 'enviado'
  preview: string
  endereco: string | null
  tipo: string | null
  lat: number | null; lng: number | null
  createdAt: number
}

export function InLocoClient() {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const coordsRef = useRef<{ lat: number; lng: number; acc: number } | null>(null)
  const [gpsAcc, setGpsAcc] = useState<number | null>(null)
  const [tipo, setTipo] = useState('')
  const [filaCount, setFilaCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [capturas, setCapturas] = useState<Captura[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const syncingRef = useRef(false)
  const tid = useRef(0)

  const toast = useCallback((msg: string, type: Toast['type'] = 'ok') => {
    const id = ++tid.current
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  // GPS ao vivo (pré-aquecido) — pino fica pronto na hora da foto
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      pos => { coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }; setGpsAcc(pos.coords.accuracy) },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)) }, [supabase])

  const refresh = useCallback(async () => {
    const q = await qAll().catch(() => [] as QItem[])
    setFilaCount(q.length)
    const fila: Captura[] = q.map(i => ({ cid: i.cid, status: 'fila', preview: URL.createObjectURL(i.blob), endereco: null, tipo: i.tipo || null, lat: i.lat, lng: i.lng, createdAt: i.createdAt }))
    const { data } = await supabase.from('leads_in_loco')
      .select('id, lat, lng, endereco, tipo_imovel, foto_url, criado_em')
      .order('criado_em', { ascending: false }).limit(50)
    const enviados: Captura[] = (data ?? []).map((r: Record<string, unknown>) => ({
      cid: `db-${r.id}`, status: 'enviado', preview: (r.foto_url as string) ?? '',
      endereco: (r.endereco as string) ?? null, tipo: (r.tipo_imovel as string) ?? null,
      lat: (r.lat as number) ?? null, lng: (r.lng as number) ?? null,
      createdAt: r.criado_em ? new Date(r.criado_em as string).getTime() : 0,
    }))
    setCapturas([...fila, ...enviados].sort((a, b) => b.createdAt - a.createdAt))
  }, [supabase])

  const sync = useCallback(async () => {
    if (syncingRef.current || typeof navigator === 'undefined' || !navigator.onLine || !userId) return
    syncingRef.current = true; setSyncing(true)
    try {
      for (const item of await qAll()) {
        try {
          const path = `${item.cid}.jpg`
          const up = await supabase.storage.from('in-loco').upload(path, item.blob, { contentType: 'image/jpeg', upsert: true })
          if (up.error) throw up.error
          const foto_url = supabase.storage.from('in-loco').getPublicUrl(path).data.publicUrl
          const ins = await supabase.from('leads_in_loco')
            .insert({ responsavel: userId, lat: item.lat, lng: item.lng, tipo_imovel: item.tipo || null, foto_url, status: 'novo' })
            .select('id').single()
          if (ins.error) throw ins.error
          if (item.lat != null && item.lng != null) {
            try {
              const res = await fetch('/api/in-loco/geo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: item.lat, lng: item.lng }) })
              const g = await res.json().catch(() => ({}))
              if (res.ok && g.endereco) await supabase.from('leads_in_loco').update({ endereco: g.endereco, endereco_fonte: g.fonte ?? null }).eq('id', (ins.data as { id: number }).id)
            } catch { /* endereço resolve depois */ }
          }
          await qDel(item.cid)
        } catch { break /* sem sinal/erro: deixa na fila pro próximo sync */ }
      }
    } finally { syncingRef.current = false; setSyncing(false); refresh() }
  }, [supabase, userId, refresh])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { if (userId) sync() }, [userId, sync])
  useEffect(() => {
    const on = () => sync()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [sync])

  const onPhoto = async (file: File) => {
    try {
      const blob = await compressImage(file)
      let lat = coordsRef.current?.lat ?? null
      let lng = coordsRef.current?.lng ?? null
      if (lat == null) { const ex = await readExifGps(file); if (ex) { lat = ex.lat; lng = ex.lng } }
      const cid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      await qAdd({ cid, blob, lat, lng, tipo, createdAt: Date.now() })
      toast(lat == null ? 'Capturado ✓ (sem GPS — ajuste depois)' : 'Capturado ✓')
      await refresh()
      sync()
    } catch { toast('Erro ao processar a foto', 'err') }
  }

  return (
    <div className="p-4 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">In Loco</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Tire a foto — salva na hora com o GPS, <strong className="text-foreground">mesmo sem sinal</strong>. O endereço resolve sozinho depois.</p>
      </div>

      {/* tipo (opcional, fica marcado pras próximas) */}
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map(t => (
          <button key={t} onClick={() => setTipo(tipo === t ? '' : t)}
            className="px-3 h-8 rounded-full text-[12px] font-medium transition-colors cursor-pointer"
            style={tipo === t
              ? { background: 'var(--primary)', color: '#fff' }
              : { background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            {t}
          </button>
        ))}
      </div>

      {/* BOTÃO CAPTURAR */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />
      <button onClick={() => fileRef.current?.click()}
        className="w-full h-32 rounded-2xl font-bold text-white text-lg flex flex-col items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer"
        style={{ background: 'var(--primary)' }}>
        <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
        Capturar imóvel{tipo ? ` · ${tipo}` : ''}
      </button>

      {/* status GPS + fila */}
      <div className="flex items-center justify-between text-[11px] -mt-1 px-1">
        <span className="text-muted-foreground">
          {gpsAcc == null ? '📍 buscando GPS…' : `📍 GPS pronto · ±${Math.round(gpsAcc)} m`}
        </span>
        <span className="font-mono" style={{ color: filaCount ? 'var(--primary)' : 'var(--muted-foreground)' }}>
          {syncing ? 'enviando…' : filaCount ? `${filaCount} na fila` : 'tudo enviado ✓'}
        </span>
      </div>

      <a href="/in-loco/revisar" className="text-[12px] text-primary hover:underline text-center -mt-2">Revisar / completar capturas →</a>

      {/* minhas capturas */}
      {capturas.length === 0 && (
        <p className="text-center text-xs text-muted-foreground/50 py-2">Nenhuma captura ainda neste dispositivo.</p>
      )}
      {capturas.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-muted-foreground/50">Minhas capturas ({capturas.length})</p>
          {capturas.map(c => (
            <div key={c.cid} className="rounded-lg overflow-hidden flex items-center gap-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              {c.preview
                ? <img src={c.preview} alt="" className="w-16 h-16 object-cover flex-shrink-0" />
                : <div className="w-16 h-16 flex-shrink-0" style={{ background: 'var(--muted)' }} />}
              <div className="min-w-0 py-2 pr-2 flex-1">
                <p className="text-sm text-foreground font-medium leading-snug truncate">
                  {c.endereco || (c.status === 'fila' ? 'Na fila…' : 'Endereço pendente')}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {c.tipo ? <span>{c.tipo}</span> : null}
                  {c.tipo && c.lat && c.lng ? ' · ' : null}
                  {c.lat && c.lng ? <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}>mapa ↗</a> : null}
                  {!c.tipo && !(c.lat && c.lng) ? '—' : null}
                </p>
              </div>
              <span className="text-[9px] px-2 py-1 rounded-full mr-2 flex-shrink-0 text-white"
                style={{ background: c.status === 'fila' ? 'var(--chart-2)' : 'var(--success)' }}>
                {c.status === 'fila' ? 'na fila' : 'enviado'}
              </span>
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
