// Consulta o FeatureServer do Cadastro Territorial do IDE-DF (SEDUH/TERRACAP).
// Fonte mais completa que o WFS geonode:lote_registrado — tem todos os lotes SHIS/SHIN
// incluindo os que o WFS omite (ex: SHIS QI 27 CJ 4 LT 7).
// Vantagem extra: já retorna pu_ciu, eliminando a necessidade de match espacial para piscinas.

import type { Candidato, LoteRegistrado } from './wfs-idedf'

const CTM_BASE = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/FeatureServer'

const CTM_LOTE_FIELDS = 'objectid,pu_ciu,pu_end_usual,pu_end_cart,qd_setor,qd_quadra,qd_conjunto,qd_lote,pu_ra'

type CtmLote = {
  objectid: number
  pu_ciu: string | null
  pu_end_usual: string | null
  pu_end_cart: string | null
  qd_setor: string | null
  qd_quadra: string | null
  qd_conjunto: string | null
  qd_lote: string | null
  pu_ra: number | null
}

function ctmParaLote(a: CtmLote): LoteRegistrado {
  return {
    fid: a.objectid,
    id: a.objectid,
    ra: a.pu_ra ?? null,
    setor: a.qd_setor ?? null,
    quadra: a.qd_quadra ?? null,
    conjunto: a.qd_conjunto ?? null,
    lote: a.qd_lote ?? null,
    end_cart: a.pu_end_cart ?? null,
    end_usual: a.pu_end_usual ?? null,
    end_siturb: a.pu_end_usual ?? null,
    area_proj: null,
    situacao: null,
    codigo: null,
    ciu: a.pu_ciu ?? null,
  }
}

// Busca candidatos de lote via CTM Layer 10 (pu_end_usual LIKE '%QI XX CJ Y%').
// Mais completo que o WFS — inclui lotes que o geonode:lote_registrado omite.
// Enriquece com área construída (Layer 5 Edificação) para diferenciar lotes por tamanho.
export async function buscarCandidatosCTM(opts: {
  quadra?: string | null
  conjunto?: string | null
  setor?: string | null
  limite?: number
}): Promise<Candidato[]> {
  const { quadra, conjunto, setor } = opts
  if (!quadra) return []

  const cj = conjunto ? ` CJ ${conjunto}` : ''
  const st = setor ? `${setor} ` : ''
  const pattern = `${st}${quadra}${cj}`

  const where = encodeURIComponent(`pu_end_usual LIKE '%${pattern}%'`)
  const url = `${CTM_BASE}/10/query?where=${where}` +
    `&outFields=${CTM_LOTE_FIELDS}&returnGeometry=false&returnCentroid=true&outSR=4326` +
    `&resultRecordCount=${opts.limite ?? 60}&f=json`

  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return []

  const j = await r.json() as {
    features?: { attributes: CtmLote; centroid?: { x: number; y: number } }[]
  }
  const features = (j.features ?? []).filter(f => f.centroid)
  if (!features.length) return []

  // Busca área construída por lote (Layer 5) em paralelo — vários registros por CIU
  // (casa principal + garagem + edícula...), soma todos para área total construída.
  const cius = features.map(f => f.attributes.pu_ciu).filter(Boolean) as string[]
  const areaEdif = cius.length ? await fetchAreaEdificacao(cius) : new Map<string, number>()

  return features.map(f => {
    const lote = ctmParaLote(f.attributes)
    lote.area_proj = (f.attributes.pu_ciu ? areaEdif.get(f.attributes.pu_ciu) : null) ?? null
    return {
      lote,
      endereco: f.attributes.pu_end_usual ?? null,
      centro: [f.centroid!.x, f.centroid!.y] as [number, number],
      distancia_m: null,
    }
  })
}

async function fetchAreaEdificacao(cius: string[]): Promise<Map<string, number>> {
  const lista = cius.map(c => `'${c}'`).join(',')
  const url = `${CTM_BASE}/5/query?where=ed_ciu+IN+(${encodeURIComponent(lista)})` +
    `&outFields=ed_ciu,ed_area&returnGeometry=false&f=json`
  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return new Map()
  const j = await r.json() as { features?: { attributes: { ed_ciu: string; ed_area: number | null } }[] }
  const result = new Map<string, number>()
  for (const f of j.features ?? []) {
    const { ed_ciu, ed_area } = f.attributes
    if (ed_ciu && ed_area) result.set(ed_ciu, (result.get(ed_ciu) ?? 0) + ed_area)
  }
  return result
}

// ── Piscinas ──────────────────────────────────────────────────────────────────

// Retorna array parallel aos candidatos: true = tem piscina, false = não tem, null = sem dado.
// Quando os candidatos têm CIU (fonte CTM), usa query direta por CIU — mais confiável.
// Quando não têm CIU (fonte WFS antiga), cai no match espacial por centroide.
export async function consultarPiscinasCTM(
  candidatos: Candidato[]
): Promise<(boolean | null)[]> {
  if (!candidatos.length) return []

  const cius = candidatos.map(c => c.lote.ciu)
  const todosComCiu = cius.every(c => c)

  if (todosComCiu) {
    return piscinasPorCiu(cius as string[], candidatos.length)
  }
  return piscinasPorSpatial(candidatos)
}

async function piscinasPorCiu(cius: string[], total: number): Promise<(boolean | null)[]> {
  const lista = cius.map(c => `'${c}'`).join(',')
  const url = `${CTM_BASE}/6/query?where=pi_ciu+IN+(${encodeURIComponent(lista)})` +
    `&outFields=pi_ciu&returnGeometry=false&f=json`

  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return Array(total).fill(null)

  const j = await r.json() as { features?: { attributes: { pi_ciu: string } }[] }
  const ciuSet = new Set((j.features ?? []).map(f => f.attributes.pi_ciu))

  return cius.map(ciu => ciuSet.has(ciu))
}

// ── Fallback espacial (para candidatos sem CIU, fonte WFS) ────────────────────

const MAX_MATCH_DEG = 0.001

type CtmFeature = { ciu: string; cx: number; cy: number }

async function fetchCtmLotes(bbox: string): Promise<CtmFeature[]> {
  const url = `${CTM_BASE}/10/query?where=1%3D1` +
    `&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=pu_ciu&returnGeometry=false&returnCentroid=true&outSR=4326&f=json`
  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return []
  const j = await r.json() as {
    features?: { attributes: { pu_ciu: string | null }; centroid?: { x: number; y: number } }[]
  }
  return (j.features ?? [])
    .filter(f => f.attributes.pu_ciu && f.centroid)
    .map(f => ({ ciu: f.attributes.pu_ciu!, cx: f.centroid!.x, cy: f.centroid!.y }))
}

async function fetchCiusComPiscina(bbox: string): Promise<Set<string>> {
  const url = `${CTM_BASE}/6/query?where=1%3D1` +
    `&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=pi_ciu&returnGeometry=false&f=json`
  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return new Set()
  const j = await r.json() as { features?: { attributes: { pi_ciu: string | null } }[] }
  return new Set(
    (j.features ?? []).map(f => f.attributes.pi_ciu).filter(Boolean) as string[]
  )
}

async function piscinasPorSpatial(candidatos: Candidato[]): Promise<(boolean | null)[]> {
  const lngs = candidatos.map(c => c.centro[0])
  const lats  = candidatos.map(c => c.centro[1])
  const pad = 0.002
  const bbox = `${Math.min(...lngs) - pad},${Math.min(...lats) - pad},${Math.max(...lngs) + pad},${Math.max(...lats) + pad}`

  const [ctmLotes, ciusPiscina] = await Promise.all([
    fetchCtmLotes(bbox),
    fetchCiusComPiscina(bbox),
  ])

  if (!ctmLotes.length) return candidatos.map(() => null)

  return candidatos.map(cand => {
    const [lng, lat] = cand.centro
    let bestCiu: string | null = null
    let bestDist = Infinity
    for (const lot of ctmLotes) {
      const d = Math.sqrt((lot.cx - lng) ** 2 + (lot.cy - lat) ** 2)
      if (d < bestDist) { bestDist = d; bestCiu = lot.ciu }
    }
    if (bestCiu === null || bestDist > MAX_MATCH_DEG) return null
    return ciusPiscina.has(bestCiu)
  })
}
