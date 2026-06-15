// Cliente WFS do Serviço Geológico do Brasil (SGB, ex-CPRM).
// Espelha o padrão de lib/wfs-idedf.ts. Os hosts cprm.gov.br morreram — tudo migrou
// para sgb.gov.br. Usado pela Ficha de Risco (lib/ficha-risco.ts).

const WFS = 'https://geoservicos.sgb.gov.br/geoserver/wfs'

type WfsFeature<P> = { type: 'Feature'; properties: P; geometry: unknown }
type WfsResponse<P> = { type: 'FeatureCollection'; features: WfsFeature<P>[]; totalFeatures?: number }

async function wfs<P>(typeName: string, params: Record<string, string>): Promise<WfsResponse<P>> {
  const url = new URL(WFS)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeName', typeName)
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('srsName', 'EPSG:4326')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const r = await fetch(url.toString(), {
    headers: { 'User-Agent': 'TRK-Imoveis/1.0 (ficha-risco)' },
    signal: AbortSignal.timeout(9000),
  })
  if (!r.ok) throw new Error(`SGB WFS HTTP ${r.status}`)
  return r.json() as Promise<WfsResponse<P>>
}

/** Feições que cobrem um ponto. bbox minúscula = ponto-em-polígono robusto
 *  (não depende do nome da coluna de geometria; polígonos de risco cobrem área). */
export async function sgbNoPonto<P>(typeName: string, lat: number, lng: number, props?: string[]): Promise<P[]> {
  const e = 0.0001  // ~11m
  const bbox = `${lng - e},${lat - e},${lng + e},${lat + e},EPSG:4326`
  const params: Record<string, string> = { count: '5', bbox }
  if (props?.length) params.propertyName = props.join(',')
  const r = await wfs<P>(typeName, params)
  return (r.features ?? []).map(f => f.properties)
}

/** Feições numa bbox (raio em graus ~ metros/111000). p/ contagem de vizinhança. */
export async function sgbNaBbox<P>(typeName: string, lat: number, lng: number, raioDeg: number, limite = 50, props?: string[]): Promise<P[]> {
  const bbox = `${lng - raioDeg},${lat - raioDeg},${lng + raioDeg},${lat + raioDeg},EPSG:4326`
  const params: Record<string, string> = { count: String(limite), bbox }
  if (props?.length) params.propertyName = props.join(',')
  const r = await wfs<P>(typeName, params)
  return (r.features ?? []).map(f => f.properties)
}
