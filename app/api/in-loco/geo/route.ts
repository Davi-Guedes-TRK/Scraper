import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GEOPORTAL =
  'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/MapServer/10/query'
const UA = 'PainelCaptacao/1.0 TRK-Imoveis'

// Endereço usual do cadastro do DF (mesma fonte do resolve-maps).
async function geoportal(lat: number, lng: number): Promise<string | null> {
  const p = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'pu_end_usual', f: 'json',
  })
  try {
    const r = await fetch(`${GEOPORTAL}?${p}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    return (d.features?.[0]?.attributes?.pu_end_usual as string) ?? null
  } catch { return null }
}

// Fallback quando o ponto cai fora da malha cadastral do DF.
async function nominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = await r.json() as { display_name?: string }
    return d.display_name ?? null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const { lat, lng } = body
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat/lng obrigatórios' }, { status: 400 })
  }

  let endereco = await geoportal(lat, lng)
  let fonte = 'geoportal'
  if (!endereco) { endereco = await nominatim(lat, lng); fonte = 'nominatim' }
  if (!endereco) return NextResponse.json({ error: 'Não consegui o endereço deste ponto', lat, lng }, { status: 422 })

  return NextResponse.json({ endereco, fonte, lat, lng })
}
