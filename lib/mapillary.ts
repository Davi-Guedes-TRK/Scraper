// Mapillary (imagens street-level abertas) — reduz o ida-e-volta ao Google Maps
// no único passo humano da triagem. Sem token configurado = no-op (não quebra).
// Token grátis: mapillary.com/dashboard/developers → MAPILLARY_TOKEN no .env.local.

const GRAPH = 'https://graph.mapillary.com/images'

export type ImagemMapillary = {
  id: string
  thumb: string          // URL direta da imagem (thumb_1024)
  capturedAt: number     // epoch ms
  compassAngle: number | null
  distancia_m: number    // do ponto de referência
  viewer: string         // link p/ abrir no app do Mapillary
}

// 1 grau de lng a ~-15.8° (Brasília) ≈ 107km → ~90m de raio
const RAIO_DEG = 0.0009

export async function buscarImagensMapillary(
  lat: number, lng: number, limite = 8,
): Promise<ImagemMapillary[]> {
  const token = process.env.MAPILLARY_TOKEN
  if (!token) return []

  const bbox = [lng - RAIO_DEG, lat - RAIO_DEG, lng + RAIO_DEG, lat + RAIO_DEG].join(',')
  const url = `${GRAPH}?access_token=${token}`
    + `&fields=id,thumb_1024_url,captured_at,compass_angle,geometry`
    + `&bbox=${bbox}&limit=${Math.min(50, limite * 4)}`

  let data: { data?: Array<{ id: string; thumb_1024_url?: string; captured_at?: number; compass_angle?: number; geometry?: { coordinates?: [number, number] } }> }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    data = await r.json()
  } catch {
    return []
  }

  const itens = (data.data ?? [])
    .filter(d => d.thumb_1024_url && d.geometry?.coordinates)
    .map(d => {
      const [ilng, ilat] = d.geometry!.coordinates!
      const dx = ilng - lng, dy = ilat - lat
      return {
        id: d.id,
        thumb: d.thumb_1024_url!,
        capturedAt: d.captured_at ?? 0,
        compassAngle: d.compass_angle ?? null,
        distancia_m: Math.round(Math.sqrt(dx * dx + dy * dy) * 111_000),
        viewer: `https://www.mapillary.com/app/?pKey=${d.id}&focus=photo`,
      }
    })
    // mais perto primeiro; entre próximos, o mais recente
    .sort((a, b) => a.distancia_m - b.distancia_m || b.capturedAt - a.capturedAt)

  return itens.slice(0, limite)
}
