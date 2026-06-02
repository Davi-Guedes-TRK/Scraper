import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GEOPORTAL =
  'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/MapServer/10/query'
const UA = 'PainelCaptacao/1.0 TRK-Imoveis'

type GeoFeature = { attributes?: { pu_end_usual?: string }; geometry?: { rings?: number[][][] } }

async function geoQuery(lat: number, lng: number, distance: number, withGeom: boolean): Promise<GeoFeature[]> {
  const p = new URLSearchParams({
    geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'pu_end_usual',
    returnGeometry: withGeom ? 'true' : 'false', f: 'json',
  })
  if (distance > 0) { p.set('distance', String(distance)); p.set('units', 'esriSRUnit_Meter') }
  try {
    const r = await fetch(`${GEOPORTAL}?${p}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    const d = await r.json()
    return (d.features as GeoFeature[]) ?? []
  } catch { return [] }
}

// Endereço usual do cadastro do DF. Exato (ponto dentro do lote); se vazio (GPS na rua),
// busca num raio de 30m e devolve o LOTE MAIS PRÓXIMO do ponto.
async function geoportal(lat: number, lng: number): Promise<string | null> {
  const exact = await geoQuery(lat, lng, 0, false)
  if (exact[0]?.attributes?.pu_end_usual) return exact[0].attributes.pu_end_usual

  const near = await geoQuery(lat, lng, 30, true)
  let best: GeoFeature | null = null
  let bestD = Infinity
  for (const f of near) {
    const ring = f.geometry?.rings?.[0]
    if (!ring?.length) continue
    let sx = 0, sy = 0
    for (const [x, y] of ring) { sx += x; sy += y }
    const cx = sx / ring.length, cy = sy / ring.length
    const dist = (cy - lat) ** 2 + (cx - lng) ** 2   // ranking planar — ok nesta escala
    if (dist < bestD) { bestD = dist; best = f }
  }
  return best?.attributes?.pu_end_usual ?? near[0]?.attributes?.pu_end_usual ?? null
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
