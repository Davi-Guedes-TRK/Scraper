// PoC do "geovisual": dado um endereço impreciso (pistas ou ponto), traz os lotes
// candidatos do IDE-DF e os ranqueia pelas features que TEMOS hoje — área (area_proj
// vs area_m2 do anúncio) e sobreposição de tokens de endereço. A camada de visão
// (piscina/telhado via SAM 2) é uma costura explícita (anotarPiscina), ainda não
// implementada — ver project_geovisual_poc.
//
// Saída prática: candidato `melhor` + nível de `confianca`, que alimenta o GATE
// de auto-envio ao cartório (auto-envia só quando há candidato de confiança alta).

import { buscarCandidatos, type Candidato } from './wfs-idedf'

export type CandidatoPontuado = Candidato & {
  score: number
  areaScore: number | null   // null = anúncio/lote sem área para comparar
  addrScore: number
  piscina: boolean | null     // preenchido pela visão; null = não avaliado
}

export type ResultadoCandidatos = {
  candidatos: CandidatoPontuado[]
  melhor: CandidatoPontuado | null
  confianca: 'alta' | 'media' | 'baixa' | 'nenhuma'
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function tokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  return new Set(norm(s).match(/[a-z0-9]+/g) ?? [])
}

/** Fração dos tokens do anúncio presentes no endereço do candidato (0..1). */
function addrScore(ref: Set<string>, cand: string | null): number {
  if (!ref.size || !cand) return 0
  const c = tokens(cand)
  let hit = 0
  ref.forEach(t => { if (c.has(t)) hit++ })
  return hit / ref.size
}

/** Proximidade de área: 0% de diferença = 1, 100%+ de diferença = 0. null se faltar dado. */
function areaScore(areaM2: number | null | undefined, areaProj: number | null): number | null {
  if (!areaM2 || !areaProj) return null
  return Math.max(0, 1 - Math.abs(areaProj - areaM2) / areaM2)
}

export async function acharCandidatos(opts: {
  lat?: number; lng?: number
  quadra?: string | null; conjunto?: string | null; setor?: string | null
  endereco?: string | null
  area_m2?: number | null
}): Promise<ResultadoCandidatos> {
  const brutos = await buscarCandidatos(opts)

  const ref = tokens([opts.endereco, opts.quadra, opts.conjunto, opts.setor].filter(Boolean).join(' '))

  const candidatos: CandidatoPontuado[] = brutos
    .map(c => {
      const a  = areaScore(opts.area_m2, c.lote.area_proj)
      const ad = addrScore(ref, c.endereco ?? c.lote.end_cart)
      // Endereço pesa 0.6 e área 0.4 quando há área; sem área, 100% endereço.
      const score = a != null ? ad * 0.6 + a * 0.4 : ad
      return { ...c, score, areaScore: a, addrScore: ad, piscina: null as boolean | null }
    })
    .sort((x, y) => y.score - x.score)

  const melhor  = candidatos[0] ?? null
  const segundo = candidatos[1] ?? null

  let confianca: ResultadoCandidatos['confianca'] = 'nenhuma'
  if (melhor) {
    const gap = melhor.score - (segundo?.score ?? 0)
    if (melhor.score >= 0.7 && gap >= 0.2) confianca = 'alta'
    else if (melhor.score >= 0.5)          confianca = 'media'
    else                                    confianca = 'baixa'
  }

  return { candidatos, melhor, confianca }
}

// ── Camada de visão (piscina, telhado, etc.) — SEAM, NÃO implementado ────────────
// Exige ortofoto/satélite + segmentação (SAM 2) rodando em GPU (Colab T4), fora do
// serverless. Quando existir, anota cada candidato com piscina:true/false e o score
// acima passa a ponderá-la. Mantido como no-op explícito para NÃO inventar piscina.
export async function anotarPiscina(cands: CandidatoPontuado[]): Promise<CandidatoPontuado[]> {
  return cands  // piscina permanece null = não avaliado
}
