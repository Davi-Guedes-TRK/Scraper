// Lógica de cartório compartilhada entre a UI (Tratar resposta) e o webhook de
// inbound (/api/cartorio/inbound). Mantém um único lugar para parse + matching.

export type EnderecoFonte = {
  endereco?: string | null
  pistas_ia?: { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null } | null
  bairro?: string | null
  titulo?: string | null
}

/** Endereço exibível/comparável a partir de um imóvel (endereço > pistas > bairro > título). */
export function formatEndereco(item: EnderecoFonte): string {
  if (item.endereco) return item.endereco
  if (item.pistas_ia) {
    const p = item.pistas_ia
    const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean) as string[]
    if (parts.length) return parts.join(', ')
  }
  return item.bairro || item.titulo || '—'
}

export type ParsedEntry = { address: string; matricula: string }

/** Quebra a resposta do cartório em pares endereço→matrícula.
 *  Suporta os formatos reais observados:
 *    "SQN 312 Bl B Ap 204 - 123456"          (traço)
 *    "SQN 312 Bl B Ap 204: MATRÍCULA 123456"  (dois-pontos + label)
 *    "1. SQN 312 Bl B Ap 204: MATRÍCULA 123456;"  (lista numerada)
 */
export function parseCartorioEntries(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  // Normaliza: remove numeração de lista ("1. ", "2) ") no início de cada linha
  const normalized = text.replace(/^\s*\d+[.)]\s*/gm, '')
  // Captura: <endereço> seguido de " - NUM" ou ": [MATRÍCULA] NUM"
  const re = /(.+?)\s*(?:-|:\s*(?:MATR[ÍI]CULA\s*)?)\s*(\d{4,})\s*[;,]?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
    const address  = match[1].trim()
    const matricula = match[2].trim()
    if (address && matricula) entries.push({ address, matricula })
  }
  return entries
}

/** Score de semelhança pelo CONJUNTO de números (robusto a formato/acento). */
export function scoreAddress(candidate: string, reference: string): number {
  // Compara só o fim do candidato (o endereço real fica sempre no final).
  const tail = candidate.slice(-120)
  const numSet = (s: string) =>
    new Set((s.match(/\d+/g) ?? []).map(n => String(parseInt(n, 10))))
  const c = numSet(tail), r = numSet(reference)
  let matches = 0
  r.forEach(n => { if (c.has(n)) matches++ })
  return matches
}

export type Candidate = { link: string; portal: string; endereco: string }
export type ReplyMatch = { matricula: string; address: string; candidate: Candidate | null }

/** Casa cada matrícula do texto colado/recebido com o imóvel de maior score. */
export function matchCartorioReply(text: string, candidates: Candidate[]): ReplyMatch[] {
  return parseCartorioEntries(text).map(e => {
    let best: Candidate | null = null
    let bestScore = 0
    for (const c of candidates) {
      const s = scoreAddress(e.address, c.endereco)
      if (s > bestScore) { bestScore = s; best = c }
    }
    return { matricula: e.matricula, address: e.address, candidate: bestScore > 0 ? best : null }
  })
}
