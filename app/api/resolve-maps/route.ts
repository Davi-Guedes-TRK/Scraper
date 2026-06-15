import { NextRequest } from 'next/server'
import { enderecoUsualPorPonto } from '@/lib/geoportal-endereco'

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

  let endereco: string | null = null
  let source: 'geoportal' | 'maps' | null = null

  if (lat !== null && lng !== null) {
    // Endereço usual oficial do IDE-DF: ponto dentro do lote OU lote mais próximo
    // (~30m) se o pin caiu na rua. Mesmo caminho validado no /api/in-loco/geo.
    endereco = await enderecoUsualPorPonto(lat, lng)
    if (endereco) source = 'geoportal'
  }

  // Último recurso: nome do lugar do próprio URL do Maps.
  // (Nominatim removido — não devolve o lote, inútil para o cartório.)
  if (!endereco) {
    const placeMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/)
    if (placeMatch) {
      endereco = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      source = 'maps'
    }
  }

  return Response.json({ endereco, lat, lng, mapsLink: finalUrl, source })
}
