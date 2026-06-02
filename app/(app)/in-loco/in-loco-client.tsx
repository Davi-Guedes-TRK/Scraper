'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type Lead = {
  id: number
  lat: number | null
  lng: number | null
  endereco: string | null
  telefone: string | null
  tipo_imovel: string | null
  obs: string | null
  status: string | null
  criado_em: string | null
}

const TIPOS = ['Apartamento', 'Casa', 'Comercial', 'Terreno', 'Kitnet', 'Outro']

type Toast = { id: number; msg: string; type: 'ok' | 'err' }

export function InLocoClient() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [endereco, setEndereco] = useState('')
  const [fonte, setFonte] = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [tipo, setTipo] = useState('')
  const [obs, setObs] = useState('')
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
      else toast(d.error ?? 'Não achei o endereço — digite manual', 'err')
    } catch { toast('Erro ao buscar endereço', 'err') }
    finally { setGeocoding(false) }
  }, [toast])

  const pegarLocalizacao = () => {
    if (!('geolocation' in navigator)) { toast('Sem GPS neste dispositivo', 'err'); return }
    setLocating(true); setFonte(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setCoords({ lat, lng }); setLocating(false); geocode(lat, lng)
      },
      err => { setLocating(false); toast(err.code === 1 ? 'Permissão de localização negada' : 'Não consegui o GPS', 'err') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const limpar = () => { setCoords(null); setEndereco(''); setFonte(null); setTelefone(''); setTipo(''); setObs('') }

  const salvar = async () => {
    if (!endereco.trim()) { toast('Endereço é obrigatório', 'err'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/in-loco', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: coords?.lat ?? null, lng: coords?.lng ?? null, endereco: endereco.trim(),
          fonte, telefone: telefone.trim(), tipo_imovel: tipo, obs: obs.trim(),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast(`Erro ao salvar: ${d.error ?? res.status}`, 'err'); return }
      toast('Imóvel salvo ✓', 'ok'); limpar(); loadRecent()
    } catch { toast('Erro ao salvar', 'err') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 ring-ring/30 transition-all'
  const inputStyle = { background: 'var(--secondary)', border: '1px solid var(--border)' }

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">In Loco</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Captura no local: GPS → endereço, salva o imóvel visto na rua.</p>
      </div>

      {/* 1. localização */}
      <button onClick={pegarLocalizacao} disabled={locating || geocoding}
        className="w-full h-12 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        style={{ background: 'var(--primary)' }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
        {locating ? 'Pegando GPS…' : geocoding ? 'Buscando endereço…' : coords ? 'Pegar localização de novo' : 'Pegar localização'}
      </button>

      {coords && (
        <p className="text-[11px] text-muted-foreground font-mono -mt-2 text-center">
          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} ·{' '}
          <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}>ver no mapa ↗</a>
        </p>
      )}

      {/* 2. dados */}
      <div className="flex flex-col gap-3 rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div>
          <label className="text-[11px] font-semibold text-foreground flex items-center gap-2 mb-1">
            Endereço <span className="text-destructive">*</span>
            {fonte && <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{fonte}</span>}
          </label>
          <input value={endereco} onChange={e => setEndereco(e.target.value)}
            placeholder="Pegue o GPS ou digite" className={inputCls} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-foreground block mb-1">Telefone</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} type="tel"
              placeholder="da placa" className={inputCls} style={inputStyle} />
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
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            placeholder="ex: placa Imobiliária X, prédio antigo…" className={`${inputCls} resize-none`} style={inputStyle} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={limpar} disabled={saving}
            className="px-4 h-11 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:text-foreground transition-colors disabled:opacity-40">
            Limpar
          </button>
          <button onClick={salvar} disabled={saving || !endereco.trim()}
            className="flex-1 h-11 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            style={{ background: 'var(--primary)' }}>
            {saving ? 'Salvando…' : 'Salvar imóvel'}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center">Foto do imóvel chega na próxima versão (precisa de storage).</p>
      </div>

      {/* 3. recentes */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-muted-foreground/50">Capturados recentemente ({recent.length})</p>
          {recent.slice(0, 20).map(l => (
            <div key={l.id} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="text-foreground font-medium leading-snug">{l.endereco}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[l.tipo_imovel, l.telefone].filter(Boolean).join(' · ') || '—'}
                {l.lat && l.lng && (
                  <> · <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}>mapa ↗</a></>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white ${t.type === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
