// Endereço usual oficial do cadastro do DF (IDE-DF, ArcGIS) a partir de um ponto.
// Ponto DENTRO do lote → endereço exato; se o ponto caiu na rua, busca num raio de
// 30m e devolve o LOTE MAIS PRÓXIMO. Padrão validado em produção (/api/in-loco/geo).
// Reusado pelo resolve-maps p/ não cair em reverse-geocode genérico (Nominatim).

const GEOPORTAL =
  'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/MapServer/10/query'

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

/** Endereço usual do DF p/ o ponto: exato no lote, ou o lote mais próximo (~30m). */
export async function enderecoUsualPorPonto(lat: number, lng: number): Promise<string | null> {
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
