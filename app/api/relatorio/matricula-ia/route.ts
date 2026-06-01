import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

type ImovelInput = { id: string; endereco: string }
type Match = { id: string; matricula: string }

export async function POST(req: NextRequest) {
  let body: { texto: string; imoveis: ImovelInput[] }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { texto, imoveis } = body
  if (!texto?.trim() || !imoveis?.length) {
    return Response.json({ error: 'texto e imoveis obrigatórios' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return Response.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 })

  const ai = new GoogleGenerativeAI(apiKey)
  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

  const listaStr = imoveis.map((im, i) => `${i + 1}. [id:${im.id}] ${im.endereco}`).join('\n')

  const prompt = `Você receberá um texto do cartório com vários imóveis e seus números de matrícula concatenados sem separador claro, e uma lista de endereços de imóveis identificados por id.

Para cada imóvel da lista, localize no texto do cartório o endereço correspondente e extraia o número de matrícula (formato típico: "endereço - NÚMERO").

TEXTO DO CARTÓRIO:
${texto}

LISTA DE IMÓVEIS:
${listaStr}

Responda SOMENTE com JSON válido sem markdown, array de objetos:
[{"id":"...","matricula":"NÚMERO"}]

Inclua apenas os imóveis para os quais encontrou correspondência clara. Omita os demais.`

  let lastErr = ''
  for (const modelName of MODELS) {
    try {
      const res = await ai.getGenerativeModel({ model: modelName }).generateContent(prompt)
      const raw = res.response.text()
      const start = raw.indexOf('['), end = raw.lastIndexOf(']')
      if (start === -1 || end <= start) return Response.json({ matches: [] })
      const matches: Match[] = JSON.parse(raw.slice(start, end + 1))
      return Response.json({ matches })
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      // 503 / overloaded — try next model
      if (!/503|overload|unavailable/i.test(lastErr)) break
    }
  }
  return Response.json({ error: lastErr }, { status: 500 })
}
