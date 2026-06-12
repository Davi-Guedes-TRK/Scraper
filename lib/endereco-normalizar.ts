// Normalização canônica de endereço p/ dedup contra o espelho do dw_trk (Nido).
// Usada pelo app (Next) E pelo scripts/dw_sync.mjs — Node 24 importa .ts direto
// (type stripping). Por isso este módulo é SELF-CONTAINED de propósito: import
// relativo sem extensão quebraria no Node fora do bundler.
//
// Difere do parseEnderecoDF (lib/endereco-df.ts, focado no WFS casa/lote): aqui
// precisamos cobrir TAMBÉM superquadra/comercial (SQN/SQNW/CLN…), porque o dw_trk
// tem muitos apartamentos.

const TOKENS: Array<[RegExp, string]> = [
  [/\bCONJUNTO\b|\bCONJ\b/g, 'CJ'],
  [/\bQUADRA\b|\bQD\b/g, 'Q'],
  [/\bCASA\b/g, 'CS'],
  [/\bLOTE\b/g, 'LT'],
  [/\bBLOCO\b/g, 'BL'],
  [/\bTORRE\b/g, 'BL'],
  [/\bAPARTAMENTO\b|\bAPTO\b|\bAPART\b|\bAPT\b/g, 'AP'],
  [/\bCOBERTURA\b|\bCOB\b/g, 'AP'],
  [/\bNUMERO\b|\bNUM\b/g, 'N'],
  [/\bTRECHO\b/g, 'TR'],
]

// Palavras que só geram ruído na comparação (o sinal está na parte estruturada).
const RUIDO =
  /\b(DE|DO|DA|DOS|DAS|E|EM|BRASILIA|DF|BRASIL|LAGO|SUL|NORTE|OESTE|LESTE|SETOR|HABITACOES|INDIVIDUAIS|RESIDENCIAL|EDIFICIO|ED|CONDOMINIO|COND|RUA|AVENIDA|AV|ALAMEDA)\b/g

/** String canônica: maiúscula, sem acento, tokens abreviados, sem zeros à esquerda. */
export function enderecoNorm(texto: string | null | undefined): string {
  if (!texto) return ''
  let t = texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/N[º°O]\s*/g, 'N ')          // "nº 602" / "n° 602" → "N 602"
    .replace(/[^A-Z0-9]+/g, ' ')
  for (const [re, sub] of TOKENS) t = t.replace(re, sub)
  return t
    .replace(RUIDO, ' ')
    .replace(/\b0+(\d)/g, '$1')           // 07 → 7
    .replace(/\s+/g, ' ')
    .trim()
}

export type ChaveEndereco = {
  setor?: string      // SHIS/SHIN/SRIA… (NÃO entra na chave: confirma/derruba o match)
  quadra?: string     // "QI 11", "SQNW 106", "QNN 29"…
  grupo?: string      // "CJ 7" ou "BL F" (conjunto p/ casa, bloco p/ apartamento)
  unidade?: string    // casa/lote/apto: "17", "602", "11B"
  chave: string | null // "QI 11|CJ 7|17" — null quando não dá pra extrair com segurança
}

/** Chave estruturada de dedup. Exige quadra + unidade; grupo (cj/bl) entra se houver. */
export function chaveEndereco(texto: string | null | undefined): ChaveEndereco {
  const t = enderecoNorm(texto)
  if (!t) return { chave: null }

  const setor = t.match(/\b(SH[A-Z]{1,4}|SRIA)\b/)?.[1]

  // Família Q (casa/lote: QI/QL/QR/QS/QN/QNM/QNN/QE…) OU superquadra/comercial/setor
  // (SQN/SQNW/CLN/CRS/SMDB/SMAS/SGCV/SHCGN/AOS…). \bQ não encosta no Q de "SQNW".
  const q =
    t.match(/\b(Q[A-Z]{0,3}) (\d{1,4})\b/) ||
    t.match(/\b(SQ[A-Z]{0,2}|CL[A-Z]{0,2}|CR[A-Z]{0,2}|SM[A-Z]{0,3}|SG[A-Z]{0,3}|SHC[A-Z]{0,3}|AOS) (\d{1,4})\b/)
  const quadra = q ? `${q[1]} ${q[2]}` : undefined

  const g = t.match(/\b(CJ|BL) ([A-Z0-9]{1,3})\b/)
  const grupo = g ? `${g[1]} ${g[2]}` : undefined

  const u = t.match(/\b(?:CS|LT|AP|N) (\d{1,4}[A-Z]?|[A-Z])\b/) // "LT D" (lote letra) também vale
  const unidade = u?.[1]

  const chave = quadra && unidade ? [quadra, grupo ?? '', unidade].join('|') : null
  return { setor, quadra, grupo, unidade, chave }
}

/** Nome de pessoa canônico p/ match proprietário (sem CPF no dw_trk, match é por nome). */
export function nomeNorm(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\b(DE|DO|DA|DOS|DAS|E)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
