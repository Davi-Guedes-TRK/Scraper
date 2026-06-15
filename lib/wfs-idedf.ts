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

// ── PoC: candidatos de lote para um endereço impreciso ───────────────────────────
// Diferente de consultarLotePorPonto (1 lote), retorna TODOS os lotes plausíveis
// para depois ranquear por features (área, endereço — e, no futuro, piscina/visão).

export type Candidato = {
  lote: LoteRegistrado
  endereco: string | null     // end_siturb || end_usual || end_cart
  centro: [number, number]    // [lng, lat] do centroide
  distancia_m: number | null  // distância ao ponto de referência (se houver)
}

export async function buscarCandidatos(opts: {
  lat?: number; lng?: number
  quadra?: string | null; conjunto?: string | null; setor?: string | null
  limite?: number
}): Promise<Candidato[]> {
  const limite = opts.limite ?? 40
  let features: WfsFeature[] = []

  if (opts.lat != null && opts.lng != null) {
    // Ponto conhecido → bbox ~150m, todos os lotes ao redor são candidatos
    const deg = 0.0014
    const r = await wfsQuery({
      maxFeatures: String(limite),
      bbox: `${opts.lng - deg},${opts.lat - deg},${opts.lng + deg},${opts.lat + deg}`,
    })
    features = r.features ?? []
  } else if (opts.quadra || opts.conjunto || opts.setor) {
    // Sem ponto → filtra por atributo (quadra/conjunto/setor) via CQL
    const esc = (s: string) => s.replace(/'/g, "''").trim()
    const clauses: string[] = []
    if (opts.quadra)   clauses.push(`quadra ILIKE '${esc(opts.quadra)}'`)
    if (opts.conjunto) clauses.push(`conjunto ILIKE '${esc(opts.conjunto)}'`)
    if (opts.setor)    clauses.push(`setor ILIKE '%${esc(opts.setor)}%'`)
    if (!clauses.length) return []
    const r = await wfsQuery({ maxFeatures: String(limite), CQL_FILTER: clauses.join(' AND ') })
    features = r.features ?? []

    // Fallback: o cadastro do IDE-DF usa dois sistemas de endereço:
    //   - end_cart (cartório): "SHIS QI 10/26 LT 8"  (quadra = "QI 10/26")
    //   - end_siturb (usual):  "SHIS QI 26 CJ 14 LT 8"
    // Os anúncios usam o formato USUAL. Quando a busca por campo `quadra` falhar,
    // monta busca por `end_siturb` que usa o mesmo formato dos anúncios.
    if (features.length === 0 && opts.quadra) {
      const m = opts.quadra.match(/^(Q[A-Z]{0,3})\s+(\d+)$/i)
      if (m) {
        const prefix = m[1].toUpperCase()  // "QI", "QL", etc.
        const num = m[2]                    // "5", "26", etc.
        // Monta: end_siturb ILIKE '%QI 5 CJ 19%' (com conjunto) ou '%QI 26%' (sem)
        const cj = opts.conjunto ? ` CJ ${opts.conjunto}` : ''
        const siturb = `${prefix} ${num}${cj}`
        const fallbackClauses: string[] = [`end_siturb ILIKE '%${esc(siturb)}%'`]
        if (opts.setor) fallbackClauses.push(`setor ILIKE '%${esc(opts.setor)}%'`)
        const r2 = await wfsQuery({ maxFeatures: String(limite), CQL_FILTER: fallbackClauses.join(' AND ') })
        features = r2.features ?? []

        // Último recurso sem conjunto (pode ser que o anúncio tem conjunto mas no cadastro
        // o campo end_siturb não tem): tenta só quadra+setor via end_siturb
        if (features.length === 0 && cj) {
          const r3 = await wfsQuery({ maxFeatures: String(limite), CQL_FILTER: [`end_siturb ILIKE '%${esc(`${prefix} ${num}`)}%'`, ...(opts.setor ? [`setor ILIKE '%${esc(opts.setor)}%'`] : [])].join(' AND ') })
          features = r3.features ?? []
        }
      }
    }
  } else {
    return []
  }

  const ref: [number, number] | null =
    opts.lat != null && opts.lng != null ? [opts.lng, opts.lat] : null

  return features.map(f => {
    const centro = centroide(f.geometry)
    // sqrt(graus²)×111_000 ≈ metros (aprox. suficiente para ranquear)
    const distancia_m = ref ? Math.round(Math.sqrt(distancia2(ref, centro)) * 111_000) : null
    return {
      lote: f.properties,
      endereco: escolherSiturb(f.properties) ?? escolherCart(f.properties),
      centro,
      distancia_m,
    }
  })
}
