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

/** Quebra um texto "endereço - matrícula" (uma ou várias linhas) em pares. */
export function parseCartorioEntries(text: string): ParsedEntry[] {
  // Match " - DIGITS" — o espaço antes do traço evita hífens de palavras compostas.
  const re = / -\s*(\d+)/g
  const entries: ParsedEntry[] = []
  let lastEnd = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const addressPart = text.slice(lastEnd, match.index).trim()
    if (addressPart) entries.push({ address: addressPart, matricula: match[1] })
    lastEnd = match.index + match[0].length
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
