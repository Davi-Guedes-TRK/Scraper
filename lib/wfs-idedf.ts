const WFS_ENDPOINT = 'https://catalogo.ipe.df.gov.br/geoserver/wfs'

// raio do bbox do fallback "nearest" (~50m em graus a essa latitude)
const FALLBACK_DEG = 0.0005

export type LoteRegistrado = {
  fid: number
  id: number
  ra: number | null
  setor: string | null
  quadra: string | null
  conjunto: string | null
  lote: string | null
  end_cart: string | null
  end_usual: string | null
  end_siturb: string | null
  area_proj: number | null
  situacao: string | null
  codigo: number | null
  ciu: string | null
}

export type WfsLookupResult = {
  encontrado: boolean
  aproximado: boolean
  endereco_siturb: string | null
  endereco_cart:   string | null
  lote: LoteRegistrado | null
  bruto: unknown
}

type WfsFeature = {
  id: string
  geometry: GeoJSON.MultiPolygon
  properties: LoteRegistrado
}

type WfsResponse = {
  type: 'FeatureCollection'
  features: WfsFeature[]
  numberMatched: number
}

function escolherSiturb(props: LoteRegistrado): string | null {
  return props.end_siturb?.trim() || props.end_usual?.trim() || null
}

function escolherCart(props: LoteRegistrado): string | null {
  return props.end_cart?.trim() || null
}

// Centroide aproximado de um MultiPolygon (média dos vértices da primeira ring)
function centroide(geom: GeoJSON.MultiPolygon): [number, number] {
  const ring = geom.coordinates?.[0]?.[0] ?? []
  if (!ring.length) return [0, 0]
  let sx = 0, sy = 0
  for (const [x, y] of ring) { sx += x; sy += y }
  return [sx / ring.length, sy / ring.length]
}

function distancia2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]; const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

async function wfsQuery(params: Record<string, string>): Promise<WfsResponse> {
  const url = new URL(WFS_ENDPOINT)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '1.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeName', 'geonode:lote_registrado')
  url.searchParams.set('outputFormat', 'application/json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const r = await fetch(url.toString(), {
    headers: { 'User-Agent': 'TRK-Imoveis/1.0 (referencias-visuais)' },
  })
  if (!r.ok) throw new Error(`WFS HTTP ${r.status}`)
  return r.json() as Promise<WfsResponse>
}

export async function consultarLotePorPonto(lat: number, lng: number): Promise<WfsLookupResult> {
  // 1ª tentativa: ponto-no-polígono exato
  const exato = await wfsQuery({
    maxFeatures: '1',
    CQL_FILTER:  `INTERSECTS(the_geom, POINT(${lng} ${lat}))`,
  })

  if (exato.features?.length) {
    const f = exato.features[0]
    return {
      encontrado: true,
      aproximado: false,
      endereco_siturb: escolherSiturb(f.properties),
      endereco_cart:   escolherCart(f.properties),
      lote:  f.properties,
      bruto: f,
    }
  }

  // 2ª tentativa: bbox ~50m, escolhe lote mais próximo do ponto
  const minX = lng - FALLBACK_DEG
  const maxX = lng + FALLBACK_DEG
  const minY = lat - FALLBACK_DEG
  const maxY = lat + FALLBACK_DEG
  const vizinhos = await wfsQuery({
    maxFeatures: '30',
    bbox: `${minX},${minY},${maxX},${maxY}`,
  })

  if (!vizinhos.features?.length) {
    return {
      encontrado: false,
      aproximado: false,
      endereco_siturb: null,
      endereco_cart:   null,
      lote: null,
      bruto: vizinhos,
    }
  }

  const ponto: [number, number] = [lng, lat]
  let mais_proximo = vizinhos.features[0]
  let menor_dist = distancia2(ponto, centroide(mais_proximo.geometry))
  for (let i = 1; i < vizinhos.features.length; i++) {
    const d = distancia2(ponto, centroide(vizinhos.features[i].geometry))
    if (d < menor_dist) {
      menor_dist = d
      mais_proximo = vizinhos.features[i]
    }
  }

  return {
    encontrado: true,
    aproximado: true,
    endereco_siturb: escolherSiturb(mais_proximo.properties),
    endereco_cart:   escolherCart(mais_proximo.properties),
    lote:  mais_proximo.properties,
    bruto: mais_proximo,
  }
}
