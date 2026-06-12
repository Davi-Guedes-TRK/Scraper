// Extrai proprietário atual + CPF da certidão de ônus (PDF) via Gemini.
// Gemini lê PDF nativo (digital OU escaneado) — sem dependência nova e sem custo
// extra além da GEMINI_API_KEY que o projeto já usa em extrair-pistas.
import { GoogleGenerativeAI } from '@google/generative-ai'
import { log } from '@/lib/logger'

export type ProprietarioOnus = { nome: string; cpf?: string | null }

export type DadosOnus = {
  matricula?: string | null
  proprietarios: ProprietarioOnus[]
  tem_onus?: boolean | null
  resumo_onus?: string | null
  confianca?: 'alta' | 'media' | 'baixa' | null
}

const PROMPT = `Você é especialista em certidões de matrícula/ônus de cartório de registro de imóveis do DF (Brasil).
Analise a certidão anexa e devolva APENAS um JSON válido (sem markdown), no formato:
{
  "matricula": "número da matrícula do imóvel (só dígitos)",
  "proprietarios": [{ "nome": "NOME COMPLETO do proprietário ATUAL", "cpf": "00000000000 (só dígitos, ou null)" }],
  "tem_onus": true|false,
  "resumo_onus": "resumo em 1 frase dos ônus ativos (hipoteca, penhora, alienação fiduciária...) ou null",
  "confianca": "alta|media|baixa"
}
REGRAS:
- "Proprietário ATUAL" = o último adquirente na cadeia de registros (R-N mais recente de aquisição), NÃO os anteriores.
- Cônjuges/co-proprietários: liste todos.
- Pessoa jurídica: nome = razão social, cpf = CNPJ (só dígitos).
- Averbações de cancelamento anulam o ônus correspondente — só reporte ônus ATIVOS.
- Se não conseguir ler, devolva proprietarios: [] e confianca: "baixa".`

function cpfDigitosValidos(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  for (const n of [9, 10] as const) {
    let soma = 0
    for (let i = 0; i < n; i++) soma += parseInt(cpf[i]) * (n + 1 - i)
    const dig = ((soma * 10) % 11) % 10
    if (dig !== parseInt(cpf[n])) return false
  }
  return true
}

/** CPF (11) válido por dígito verificador, ou CNPJ (14) plausível. Senão null. */
export function sanearDocumento(doc: string | null | undefined): string | null {
  const d = (doc ?? '').replace(/\D/g, '')
  if (d.length === 11) return cpfDigitosValidos(d) ? d : null
  if (d.length === 14) return d
  return null
}

export async function extrairDadosOnus(pdfBase64: string): Promise<DadosOnus> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' })

  const res = await model.generateContent([
    PROMPT,
    { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } },
  ])
  const raw = res.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')

  let parsed: DadosOnus
  try { parsed = JSON.parse(raw) as DadosOnus } catch {
    await log('warn', 'onus-extract', 'JSON inválido do Gemini', { raw: raw.slice(0, 400) }).catch(() => {})
    return { proprietarios: [], confianca: 'baixa' }
  }

  return {
    matricula: (parsed.matricula ?? '').replace(/\D/g, '') || null,
    proprietarios: (parsed.proprietarios ?? [])
      .filter(p => p?.nome?.trim())
      .map(p => ({ nome: p.nome.trim(), cpf: sanearDocumento(p.cpf) })),
    tem_onus: parsed.tem_onus ?? null,
    resumo_onus: parsed.resumo_onus ?? null,
    confianca: parsed.confianca ?? null,
  }
}
