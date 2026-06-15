// Consulta o FeatureServer do Cadastro Territorial do IDE-DF (SEDUH/TERRACAP).
// Dado um conjunto de candidatos (com centroides WGS84 do WFS), determina quais
// têm piscina cruzando via CIU:
//   WFS centroide → match espacial → FeatureServer/10 (pu_ciu) → FeatureServer/6 (pi_ciu)
//
// Requer 2 HTTP calls por batch de candidatos (bbox único).
// Retorna null em qualquer falha — o caller trata null como "não avaliado".

import type { Candidato } from './wfs-idedf'

const CTM_BASE = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/CADASTRO_TERRITORIAL/FeatureServer'

// Distância máxima (graus) para aceitar um lote CTM como correspondente ao candidato WFS.
// ~110m em latitude; cobre lotes de até ~1500m² com folga.
const MAX_MATCH_DEG = 0.001

type CtmFeature = { ciu: string; cx: number; cy: number }

async function fetchCtmLotes(bbox: string): Promise<CtmFeature[]> {
  const url = `${CTM_BASE}/10/query?where=1%3D1` +
    `&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=pu_ciu&returnGeometry=false&returnCentroid=true&outSR=4326&f=json`
  const r = await fetch(url, { headers: { 'User-Agent': 'TRK-Imoveis/1.0' } })
  if (!r.ok) return []
  const j = await r.json() as { features?: { attributes: { pu_ciu: string | null }; centroid?: { x: number; y: number } }[] }
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
  const cius = (j.features ?? []).map(f => f.attributes.pi_ciu).filter(Boolean) as string[]
  return new Set(cius)
}

// Retorna array parallel aos candidatos: true = tem piscina, false = não tem, null = sem dado.
export async function consultarPiscinasCTM(
  candidatos: Candidato[]
): Promise<(boolean | null)[]> {
  if (!candidatos.length) return []

  const lngs = candidatos.map(c => c.centro[0])
  const lats  = candidatos.map(c => c.centro[1])
  const pad = 0.002  // ~220m de padding para cobrir polígonos dos lotes
  const bbox = `${Math.min(...lngs) - pad},${Math.min(...lats) - pad},${Math.max(...lngs) + pad},${Math.max(...lats) + pad}`

  const [ctmLotes, ciusPiscina] = await Promise.all([
    fetchCtmLotes(bbox),
    fetchCiusComPiscina(bbox),
  ])

  if (!ctmLotes.length) return candidatos.map(() => null)

  return candidatos.map(cand => {
    const [lng, lat] = cand.centro

    // Encontra o lote CTM mais próximo do centroide WFS
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
