// PoC do "geovisual": dado um endereço impreciso (pistas ou ponto), traz os lotes
// candidatos do IDE-DF e os ranqueia pelas features que TEMOS hoje — área (area_proj
// vs area_m2 do anúncio) e sobreposição de tokens de endereço. A camada de visão
// (piscina/telhado via SAM 2) é uma costura explícita (anotarPiscina), ainda não
// implementada — ver project_geovisual_poc.
//
// Saída prática: candidato `melhor` + nível de `confianca`, que alimenta o GATE
// de auto-envio ao cartório (auto-envia só quando há candidato de confiança alta).

import { buscarCandidatos, type Candidato } from './wfs-idedf'
import { parseEnderecoDF } from './endereco-df'

export type CandidatoPontuado = Candidato & {
  score: number
  areaScore: number | null   // null = anúncio/lote sem área para comparar
  addrScore: number
  loteMatch: boolean          // o número do lote bate exatamente (desempate decisivo)
  piscina: boolean | null     // preenchido pela visão; null = não avaliado
}

export type ResultadoCandidatos = {
  candidatos: CandidatoPontuado[]
  melhor: CandidatoPontuado | null
  confianca: 'alta' | 'media' | 'baixa' | 'nenhuma'
  piscinaDescricao: boolean  // descrição menciona piscina; usado quando SAM2 estiver integrado
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Canonicaliza abreviações do cadastro: o anúncio diz "Conjunto H / Lote 20",
// o IDE-DF guarda "CJ H / LT 20". Sem isso, "conjunto"≠"cj" e o match fica fraco.
const SINONIMOS: Record<string, string> = {
  conjunto: 'cj', conj: 'cj', cj: 'cj',
  lote: 'lt', lt: 'lt',
  bloco: 'bl', bl: 'bl',
  quadra: 'qd', qd: 'qd',
  apartamento: 'ap', apto: 'ap', apt: 'ap', ap: 'ap',
  casa: 'cs',
}

function tokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set()
  return new Set((norm(s).match(/[a-z0-9]+/g) ?? []).map(t => SINONIMOS[t] ?? t))
}

// Extrai o número do lote (decisivo): "LT 12A" → "12a", "Lote 20" → "20", "18" → "18".
function loteNum(s: string | null | undefined): string | null {
  if (!s) return null
  const n = norm(s)
  const m = n.match(/(?:lt|lote)\s*([0-9]+[a-z]?)/) ?? n.match(/^\s*([0-9]+[a-z]?)\s*$/)
  return m ? m[1] : null
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

// Extrai área (m²), piscina e pistas de endereço do texto da descrição do anúncio.
function parsarDescricao(desc: string | null | undefined): {
  area_m2?: number; piscina: boolean
  quadra?: string; conjunto?: string; setor?: string; casa_lote?: string
} {
  if (!desc) return { piscina: false }
  const n = norm(desc)
  // "300m²" / "300 m2" / "300 metros quadrados" — 2-5 dígitos evita match em ano ou telefone
  const m = n.match(/\b(\d{2,5})(?:[.,]\d+)?\s*(?:m[²2]|metros?\s+quadrados?)\b/)
  const area_m2 = m ? parseFloat(m[1].replace(',', '.')) : undefined
  const piscina = /piscin/.test(n)
  const { setor, quadra, conjunto, casa_lote } = parseEnderecoDF(desc)
  return { area_m2, piscina, setor, quadra, conjunto, casa_lote }
}

export async function acharCandidatos(opts: {
  lat?: number; lng?: number
  quadra?: string | null; conjunto?: string | null; setor?: string | null
  casa_lote?: string | null
  endereco?: string | null
  area_m2?: number | null
  descricao?: string | null
}): Promise<ResultadoCandidatos> {
  const desc = parsarDescricao(opts.descricao)

  // Enriquece opts com dados da descrição quando o campo está ausente
  const quadra    = opts.quadra    ?? desc.quadra    ?? null
  const conjunto  = opts.conjunto  ?? desc.conjunto  ?? null
  const setor     = opts.setor     ?? desc.setor     ?? null
  const casa_lote = opts.casa_lote ?? desc.casa_lote ?? null
  const area_m2   = opts.area_m2   ?? desc.area_m2   ?? null

  const brutos = await buscarCandidatos({ ...opts, quadra, conjunto, setor })

  const ref     = tokens([opts.endereco, quadra, conjunto, setor, casa_lote].filter(Boolean).join(' '))
  const refLote = loteNum(casa_lote) ?? loteNum(opts.endereco)

  const candidatos: CandidatoPontuado[] = brutos
    .map(c => {
      const a  = areaScore(area_m2, c.lote.area_proj)
      const ad = addrScore(ref, c.endereco ?? c.lote.end_cart)
      // O número do lote é o identificador único dentro do conjunto: se bate, desempata.
      const loteMatch = refLote != null && loteNum(c.lote.lote) === refLote
      // Endereço 0.6 + área 0.4 (sem área, 100% endereço); +0.4 se o lote bate (cap 1).
      const base  = a != null ? ad * 0.6 + a * 0.4 : ad
      const score = Math.min(1, base + (loteMatch ? 0.4 : 0))
      return { ...c, score, areaScore: a, addrScore: ad, loteMatch, piscina: null as boolean | null }
    })
    .sort((x, y) => y.score - x.score)

  const melhor  = candidatos[0] ?? null
  const segundo = candidatos[1] ?? null

  let confianca: ResultadoCandidatos['confianca'] = 'nenhuma'
  if (melhor) {
    const gap = melhor.score - (segundo?.score ?? 0)
    const loteDecisivo = melhor.loteMatch && candidatos.filter(c => c.loteMatch).length === 1
    if (loteDecisivo)                          confianca = 'alta'   // lote único que bate → decisivo
    else if (melhor.score >= 0.7 && gap >= 0.2) confianca = 'alta'
    else if (melhor.score >= 0.5)              confianca = 'media'
    else                                       confianca = 'baixa'
  }

  return { candidatos, melhor, confianca, piscinaDescricao: desc.piscina }
}

// ── Camada de visão (piscina, telhado, etc.) — SEAM, NÃO implementado ────────────
// Exige ortofoto/satélite + segmentação (SAM 2) rodando em GPU (Colab T4), fora do
// serverless. Quando existir, anota cada candidato com piscina:true/false e o score
// acima passa a ponderá-la. Mantido como no-op explícito para NÃO inventar piscina.
export async function anotarPiscina(cands: CandidatoPontuado[]): Promise<CandidatoPontuado[]> {
  return cands  // piscina permanece null = não avaliado
}
