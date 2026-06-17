import { GoogleGenerativeAI } from '@google/generative-ai'
import { log } from '@/lib/logger'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Pistas = {
  quadra?: string | null
  conjunto?: string | null
  casa_lote?: string | null
  bloco?: string | null
  numero_ap?: string | null
  andar?: string | null
  rua?: string | null
  pontos_referencia?: string[]
  bairro_confirmado?: boolean
  outros_indicios?: string | null
  confianca?: 'alta' | 'media' | 'baixa' | null
  fonte?: 'texto' | 'imagem' | 'texto+imagem' | null
}

// ── Image helpers ──────────────────────────────────────────────────────────────

const ALLOWED_HOSTS = [
  'img.dfimoveis.com.br', 'img1.dfimoveis.com.br', 'img2.dfimoveis.com.br',
  'img.olx.com.br', 'images.olx.com.br', 'img.olxcdn.com', 'cdn.olxbr.com',
  'photos.zap.com.br', 'photos.vivareal.com',
]

const REFERER: Record<string, string> = {
  'dfimoveis.com.br': 'https://www.dfimoveis.com.br/',
  'olx.com.br':       'https://www.olx.com.br/',
  'olxcdn.com':       'https://www.olx.com.br/',
  'olxbr.com':        'https://www.olx.com.br/',
  'zap.com.br':       'https://www.zapimoveis.com.br/',
  'vivareal.com':     'https://www.vivareal.com.br/',
}

function getReferer(hostname: string) {
  return Object.entries(REFERER).find(([d]) => hostname.endsWith(d))?.[1] ?? `https://${hostname}/`
}

export async function fetchImageBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const parsed = new URL(url)
    if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) return null
    const res = await fetch(url, {
      headers: { Referer: getReferer(parsed.hostname), 'User-Agent': 'Mozilla/5.0 (compatible; TRK/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return { data: Buffer.from(buf).toString('base64'), mimeType: res.headers.get('content-type') ?? 'image/jpeg' }
  } catch {
    return null
  }
}

export function parseImageUrls(imagens: string | null | undefined): string[] {
  if (!imagens) return []
  const trimmed = imagens.trim()
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch { /* fall through */ }
  }
  return trimmed.split('\n').map(u => u.trim()).filter(Boolean)
}

// ── Prompts ────────────────────────────────────────────────────────────────────

const JSON_SCHEMA = `{
  "quadra":            "ex: QI 15 | QL 12 | SQS 316 | null",
  "conjunto":          "ex: Conjunto 8 | Cj 3 | null",
  "casa_lote":         "ex: Casa 9 | Lote 4 | null",
  "bloco":             "ex: Bloco B | Bl. A | null",
  "numero_ap":         "ex: 404 | Apto 12 | null",
  "andar":             "ex: 3º andar | null",
  "rua":               "ex: Rua das Pitangueiras | null",
  "pontos_referencia": ["ex: próximo ao Clube X"],
  "bairro_confirmado": true,
  "outros_indicios":   "qualquer outra pista relevante | null",
  "confianca":         "alta | media | baixa"
}`

const CONTEXT_DF = `Contexto: imóveis do Distrito Federal (Brasil) — Lago Sul, Lago Norte, Asa Sul, Asa Norte, cidades-satélite.
Padrões de endereço do DF:
  Lago Sul/Norte : SHIS QI 17 Cj 2 Casa 10 | SHIN QI 15 Cj 8 Bl. A Ap. 404
  Asa Sul/Norte  : SQS 316 Bl. B Ap. 404 | CLN 403 Bl. A Sl. 12
  Taguatinga     : QNC 8 Cj E Casa 12 | CNB 8 Cj D Lote 2
  Sobradinho     : QD 8 Cj E Casa 4
Retorne SOMENTE JSON válido sem markdown:`

export const TEXT_PROMPT = `Você é especialista em endereços do DF.
Analise a descrição abaixo e extraia APENAS pistas que identifiquem o endereço físico do imóvel.
${CONTEXT_DF}
${JSON_SCHEMA}`

export const VISION_PROMPT = `Você é especialista em endereços do DF.
Analise esta(s) imagem(ns) de anúncio imobiliário e extraia QUALQUER texto ou elemento visual que indique endereço:
  • Placa na fachada: nome do condomínio, bloco, número
  • Letreiro de rua, quadra, conjunto visível ao fundo
  • Número na porta do apartamento
  • Documentos ou etiquetas com endereço visíveis
  • Banner do anúncio com texto de localização
Se as imagens forem apenas de interior sem nenhuma pista de endereço, retorne todos os campos null e confianca "baixa".
${CONTEXT_DF}
${JSON_SCHEMA}`

// ── Merge ──────────────────────────────────────────────────────────────────────

const SCALAR = ['quadra', 'conjunto', 'casa_lote', 'bloco', 'numero_ap', 'andar', 'rua', 'bairro_confirmado', 'outros_indicios'] as const
const CONF_ORDER = ['alta', 'media', 'baixa']

export function mergePistas(text: Pistas | null, img: Pistas | null): Pistas {
  if (!text && !img) return {}
  if (!text) return { ...img, fonte: 'imagem' }
  if (!img)  return { ...text, fonte: 'texto'  }

  const merged: Pistas = {}
  for (const f of SCALAR) {
    // imagem tem prioridade — placa é mais precisa que texto livre
    merged[f] = (img[f] != null ? img[f] : text[f] ?? null) as never
  }

  const refs = [...(text.pontos_referencia ?? []), ...(img.pontos_referencia ?? [])]
  merged.pontos_referencia = [...new Set(refs)]

  const ti = CONF_ORDER.indexOf(text.confianca ?? '')
  const ii = CONF_ORDER.indexOf(img.confianca  ?? '')
  merged.confianca = (CONF_ORDER[Math.min(ti < 0 ? 99 : ti, ii < 0 ? 99 : ii)] ?? 'baixa') as Pistas['confianca']

  const hasText = SCALAR.some(f => f !== 'bairro_confirmado' && text[f])
  const hasImg  = SCALAR.some(f => f !== 'bairro_confirmado' && img[f])
  merged.fonte  = hasText && hasImg ? 'texto+imagem' : hasImg ? 'imagem' : 'texto'

  return merged
}

// ── Core extraction functions ──────────────────────────────────────────────────

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' })
}

function parseJson(raw: string): Pistas | null {
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}

export async function extractFromText(descricao: string): Promise<Pistas | null> {
  try {
    const model = getModel()
    const res = await model.generateContent(`${TEXT_PROMPT}\n\nDescrição:\n${descricao.slice(0, 4000)}`)
    const pistas = parseJson(res.response.text())
    return pistas ? { ...pistas, fonte: 'texto' } : null
  } catch (err) {
    await log('error', 'gemini', 'Falha na extração de pistas (texto)', {
      errorMessage: err instanceof Error ? err.message : String(err),
      descricaoLength: descricao?.length,
    }).catch(() => {})
    return null
  }
}

export async function extractFromImages(imageUrls: string[]): Promise<Pistas | null> {
  const fetched = (await Promise.all(imageUrls.slice(0, 4).map(fetchImageBase64))).filter(Boolean)
  if (fetched.length === 0) return null
  try {
    const model = getModel()
    const res = await model.generateContent([
      VISION_PROMPT,
      ...fetched.map(img => ({ inlineData: img! })),
    ])
    const pistas = parseJson(res.response.text())
    return pistas ? { ...pistas, fonte: 'imagem' } : null
  } catch (err) {
    await log('error', 'gemini', 'Falha na extração de pistas (imagem)', {
      errorMessage: err instanceof Error ? err.message : String(err),
      imageCount: fetched.length,
    }).catch(() => {})
    return null
  }
}

export async function extractPistas(descricao?: string, imagens?: string): Promise<Pistas> {
  const [text, img] = await Promise.all([
    descricao?.trim() ? extractFromText(descricao) : Promise.resolve(null),
    imagens            ? extractFromImages(parseImageUrls(imagens)) : Promise.resolve(null),
  ])
  return mergePistas(text, img)
}
