import { NextRequest } from 'next/server'

const GEOPORTAL_URL =
  'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/MapServer/10/query'

async function queryGeoportal(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'pu_end_usual',
    f: 'json',
  })
  try {
    const res = await fetch(`${GEOPORTAL_URL}?${params}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    return (data.features?.[0]?.attributes?.pu_end_usual as string) ?? null
  } catch {
    return null
  }
}

// Fallback de endereço quando o Geoportal-DF não cobre o ponto (reverse geocode)
async function reverseNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
      headers: { 'User-Agent': 'PainelCaptacao/1.0 TRK-Imoveis', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const d = await res.json() as { display_name?: string }
    return d.display_name ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let body: { url: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { url } = body
  if (!url?.trim()) return Response.json({ error: 'url obrigatória' }, { status: 400 })

  // Resolve the short/full Maps URL to get the canonical URL with coordinates.
  // GET (não HEAD): links curtos do Google (maps.app.goo.gl) costumam não redirecionar em HEAD.
  let finalUrl: string
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PainelCaptacao/1.0; TRK-Imoveis)' },
    })
    finalUrl = res.url
  } catch {
    return Response.json({ error: 'Não foi possível resolver o link do Maps' }, { status: 502 })
  }

  // Prefer !3d{lat}!4d{lng} (actual pin location) over @lat,lng (camera center)
  const pinMatch = finalUrl.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/)
  const viewMatch = finalUrl.match(/@(-?[\d.]+),(-?[\d.]+)/)
  const qMatch = finalUrl.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/)
  const lat = pinMatch ? parseFloat(pinMatch[1]) : viewMatch ? parseFloat(viewMatch[1]) : qMatch ? parseFloat(qMatch[1]) : null
  const lng = pinMatch ? parseFloat(pinMatch[2]) : viewMatch ? parseFloat(viewMatch[2]) : qMatch ? parseFloat(qMatch[2]) : null

  // Primary: query Geoportal IDE-DF for pu_end_usual
  let endereco: string | null = null
  let source: 'geoportal' | 'maps' | null = null

  if (lat !== null && lng !== null) {
    endereco = await queryGeoportal(lat, lng)
    if (endereco) source = 'geoportal'
  }

  // Fallback intermediário: reverse geocode quando há coordenada mas o Geoportal-DF não cobriu o ponto
  if (!endereco && lat !== null && lng !== null) {
    endereco = await reverseNominatim(lat, lng)
    if (endereco) source = 'maps'
  }

  // Fallback: extract place name from the Maps URL path
  if (!endereco) {
    const placeMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/)
    if (placeMatch) {
      endereco = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      source = 'maps'
    }
  }

  return Response.json({ endereco, lat, lng, mapsLink: finalUrl, source })
}
