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

// ── Correlação determinística por REF (1 email por imóvel) ───────────────────────
// Cada solicitação leva uma ref curta e estável (derivada do link) no ASSUNTO.
// A resposta do cartório mantém "Re: ... [#REF]", então casamos pela ref — sem
// matching fuzzy de endereço. A ref é computada (não persistida): o inbound
// recalcula a ref de cada imóvel aguardando e compara.

/** Hash determinístico (djb2) → 6 chars base36 maiúsculo. Estável para o mesmo link. */
export function refForLink(link: string): string {
  let h = 5381
  for (let i = 0; i < link.length; i++) {
    h = ((h << 5) + h + link.charCodeAt(i)) >>> 0  // h*33 + c, unsigned
  }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6)
}

/** Formato da ref no assunto/corpo do e-mail: "[#A1B2C3]". */
export function refTag(link: string): string {
  return `[#${refForLink(link)}]`
}

/** Extrai a ref de um assunto de resposta ("Re: ... [#A1B2C3]"). */
export function parseRefFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null
  const m = subject.match(/\[#\s*([A-Z0-9]{4,8})\s*\]/i)
  return m ? m[1].toUpperCase() : null
}

/** Extrai o número da matrícula do texto da resposta (1 imóvel por e-mail).
 *  Prioriza número próximo da palavra "matrícula"; senão, a maior sequência 4-9 dígitos. */
export function parseMatriculaFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const limpo = text.replace(/\r/g, '')
  // 1) primeiro número após a palavra "matrícula" — tolera "do imóvel é", "nº", ":",
  //    e aceita separador de milhar (145.678). [^\d]{0,30} pula o texto até o número.
  const labeled = limpo.match(/matr[íi]cula[^\d]{0,30}(\d{1,3}(?:\.\d{3})+|\d{4,12})/i)
  if (labeled) {
    const d = labeled[1].replace(/\D/g, '')
    if (d.length >= 4) return d
  }
  // 2) fallback sem palavra-chave: maior número 4-9 dígitos (aceita 145.678)
  const nums = (limpo.match(/\d{1,3}(?:\.\d{3})+|\d{4,9}/g) ?? [])
    .map(n => n.replace(/\D/g, ''))
    .filter(n => n.length >= 4)
  if (!nums.length) return null
  return nums.sort((a, b) => b.length - a.length)[0]
}
