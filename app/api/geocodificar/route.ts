import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { endereco } = await req.json()
  if (!endereco?.trim()) {
    return NextResponse.json({ error: 'endereco é obrigatório' }, { status: 400 })
  }

  try {
    const q = encodeURIComponent(`${endereco.trim()}, Brasília, DF, Brasil`)
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=br&limit=1`
    const r = await fetch(url, { headers: { 'User-Agent': 'PainelCaptacao/1.0 TRK-Imoveis' } })
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`)
    const data = await r.json() as { lat: string; lon: string; display_name: string }[]
    if (!data.length) return NextResponse.json({ error: 'Endereço não encontrado' }, { status: 404 })

    const { lat, lon, display_name } = data[0]
    return NextResponse.json({ lat: parseFloat(lat), lng: parseFloat(lon), endereco_norm: display_name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[Nominatim]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
