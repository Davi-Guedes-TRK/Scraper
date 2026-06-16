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
import { buscarCandidatosCTM, consultarPiscinasCTM } from './cadastro-territorial'

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

/** Proximidade de área: 0% de diferença = 1, 100%+ de diferença = 0. null se faltar dado.
 *  Retorna null quando a área do anúncio é < 50% da área do lote — indica área construída
 *  vs área de terreno (escalas incompatíveis); nesses casos o score é ignorado. */
function areaScore(areaM2: number | null | undefined, areaProj: number | null): number | null {
  if (!areaM2 || !areaProj) return null
  if (areaM2 < areaProj * 0.5) return null  // área construída vs terreno — não comparar
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

  // CTM Layer 10 tem dados mais completos que o WFS (inclui lotes omitidos no geonode).
  // Usa CTM para buscas por endereço; WFS como fallback ou para buscas por ponto.
  let brutos = quadra
    ? await buscarCandidatosCTM({ quadra, conjunto, setor })
    : []
  if (!brutos.length) {
    brutos = await buscarCandidatos({ ...opts, quadra, conjunto, setor })
  }

  const ref     = tokens([opts.endereco, quadra, conjunto, setor, casa_lote].filter(Boolean).join(' '))
  const refLote = loteNum(casa_lote) ?? loteNum(opts.endereco)

  let pontuados: CandidatoPontuado[] = brutos
    .map(c => {
      const a  = areaScore(area_m2, c.lote.area_proj)
      const ad = addrScore(ref, c.endereco ?? c.lote.end_cart)
      const loteMatch = refLote != null && loteNum(c.lote.lote) === refLote
      const base  = a != null ? ad * 0.6 + a * 0.4 : ad
      const score = Math.min(1, base + (loteMatch ? 0.4 : 0))
      return { ...c, score, areaScore: a, addrScore: ad, loteMatch, piscina: null as boolean | null }
    })

  // Enriquece com piscina via CTM quando a descrição sugere piscina (2 chamadas HTTP extras).
  if (desc.piscina && pontuados.length) {
    try {
      const piscinaMap = await consultarPiscinasCTM(brutos)
      pontuados = pontuados.map((c, i) => {
        const temPiscina = piscinaMap[i]
        let score = c.score
        if (temPiscina === true)  score = Math.min(1, score + 0.30)
        if (temPiscina === false) score = Math.max(0, score - 0.15)
        return { ...c, piscina: temPiscina, score }
      })
    } catch {
      // CTM indisponível — mantém scores originais, piscina=null
    }
  }

  const candidatos = pontuados.sort((x, y) => y.score - x.score)

  const melhor  = candidatos[0] ?? null
  const segundo = candidatos[1] ?? null

  let confianca: ResultadoCandidatos['confianca'] = 'nenhuma'
  if (melhor) {
    const gap = melhor.score - (segundo?.score ?? 0)
    const loteDecisivo = melhor.loteMatch && candidatos.filter(c => c.loteMatch).length === 1
    if (loteDecisivo)                          confianca = 'alta'
    else if (melhor.score >= 0.7 && gap >= 0.2) confianca = 'alta'
    else if (melhor.score >= 0.5)              confianca = 'media'
    else                                       confianca = 'baixa'
  }

  return { candidatos, melhor, confianca, piscinaDescricao: desc.piscina }
}

// Anota cada candidato com piscina via CTM (cadastro territorial IDE-DF).
// SAM 2 (visão por ortofoto) é a camada complementar futura para quando CTM não cobrir.
export async function anotarPiscina(cands: CandidatoPontuado[]): Promise<CandidatoPontuado[]> {
  if (!cands.length) return cands
  try {
    const piscinaMap = await consultarPiscinasCTM(cands)
    return cands.map((c, i) => ({ ...c, piscina: piscinaMap[i] ?? null }))
  } catch {
    return cands
  }
}
