'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const MatriculaMap = dynamic(() => import('./matricula-map').then(m => m.MatriculaMap), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] bg-slate-100 rounded-lg flex items-center justify-center text-sm text-slate-400">
      Carregando mapa…
    </div>
  ),
})

interface ImovelMinimal {
  titulo?: string | null
  pistas_ia?: Record<string, unknown> | null
}

interface Props {
  item: ImovelMinimal
  onClose: () => void
}

type GeoResult = { lat: number; lng: number; displayName: string }

const NOMINATIM = 'https://nominatim.openstreetmap.org'

export function MatriculaModal({ item, onClose }: Props) {
  const pistas = (item.pistas_ia ?? {}) as Record<string, string>
  const initialAddr = [pistas.quadra, pistas.conjunto, pistas.casa_lote].filter(Boolean).join(', ')

  const [address, setAddress] = useState(initialAddr)
  const [searching, setSearching] = useState(false)
  const [geoResult, setGeoResult] = useState<GeoResult | null>(null)
  const [pinLat, setPinLat] = useState(0)
  const [pinLng, setPinLng] = useState(0)
  const [reverseName, setReverseName] = useState('')
  const [error, setError] = useState('')

  const search = async () => {
    if (!address.trim()) return
    setSearching(true)
    setError('')
    setGeoResult(null)
    setReverseName('')
    try {
      const q = encodeURIComponent(`${address.trim()}, Brasília, DF, Brasil`)
      const res = await fetch(
        `${NOMINATIM}/search?q=${q}&format=json&limit=1&countrycodes=br`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
      )
      const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json()
      if (!data.length) {
        setError('Endereço não encontrado. Tente ser mais específico.')
        return
      }
      const r = data[0]
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lon)
      setGeoResult({ lat, lng, displayName: r.display_name })
      setPinLat(lat)
      setPinLng(lng)
    } catch {
      setError('Erro ao buscar endereço. Verifique sua conexão.')
    } finally {
      setSearching(false)
    }
  }

  const onDragEnd = async (lat: number, lng: number) => {
    setPinLat(lat)
    setPinLng(lng)
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
      )
      const data: { display_name?: string } = await res.json()
      if (data.display_name) setReverseName(data.display_name)
    } catch {
      // silent
    }
  }

  const sendWhatsApp = () => {
    const mapsLink = `https://maps.google.com/?q=${pinLat},${pinLng}`
    const bairro = pistas.bairro_confirmado || ''
    const msg = [
      'Olá! Gostaria de solicitar a *matrícula* do seguinte imóvel:',
      '',
      `*Endereço:* ${address.trim()}${bairro ? `, ${bairro}` : ''}`,
      `*Localização:* ${mapsLink}`,
      '',
      'Obrigado!',
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#d0d7de] rounded-lg w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#d0d7de] flex-shrink-0">
          <h2 className="text-[#1f2328] font-semibold text-base">Solicitar Matrícula ao Cartório</h2>
          <button onClick={onClose} className="text-[#656d76] hover:text-[#1f2328] text-xl leading-none ml-3">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {item.titulo && (
            <p className="text-sm text-[#656d76] truncate">{item.titulo}</p>
          )}

          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Endereço</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={e => {
                  setAddress(e.target.value)
                  setGeoResult(null)
                  setReverseName('')
                  setError('')
                }}
                onKeyDown={e => { if (e.key === 'Enter') search() }}
                placeholder="Ex: QL 14 Conjunto 3 Casa 12, Lago Sul"
                className="flex-1 bg-[#f6f8fa] border border-[#d0d7de] text-[#1f2328] text-sm rounded-lg px-3 py-2.5 outline-none focus:border-trk-blue placeholder-[#656d76] transition-colors"
              />
              <button
                onClick={search}
                disabled={searching || !address.trim()}
                className="px-4 py-2.5 bg-trk-blue text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {searching ? '…' : 'Validar'}
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
          </div>

          {geoResult && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Localização encontrada</p>
                <p className="text-xs text-green-600 line-clamp-2">{reverseName || geoResult.displayName}</p>
              </div>

              <div>
                <p className="text-xs text-[#656d76] mb-1.5">Arraste o marcador para ajustar a posição:</p>
                <MatriculaMap lat={geoResult.lat} lng={geoResult.lng} onDragEnd={onDragEnd} />
              </div>

              <p className="text-xs text-[#8c959f]">
                Coord.: {pinLat.toFixed(6)}, {pinLng.toFixed(6)}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#d0d7de] flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-[#656d76] hover:text-[#1f2328] px-4 py-2 rounded-lg border border-[#d0d7de] hover:border-[#8c959f] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={sendWhatsApp}
            disabled={!geoResult}
            className="text-sm font-semibold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Enviar ao Cartório
          </button>
        </div>
      </div>
    </div>
  )
}
