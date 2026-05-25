import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `Você é um assistente especializado em imóveis do Lago Sul, Brasília/DF.
Analise a descrição abaixo e extraia APENAS informações que ajudem a identificar o endereço físico do imóvel.
Retorne SOMENTE um JSON válido sem markdown:
{
  "quadra": "QL 14 ou QI 9 ou null",
  "conjunto": "Conjunto 3 ou null",
  "casa_lote": "Casa 12 ou Lote 4 ou null",
  "pontos_referencia": ["próximo ao clube X", "esquina com Y"],
  "bairro_confirmado": true,
  "outros_indicios": "qualquer outra pista de localização encontrada no texto",
  "confianca": "alta, media ou baixa"
}`

export async function POST(req: NextRequest) {
  const { descricao } = await req.json()
  if (!descricao?.trim()) {
    return NextResponse.json({ error: 'Campo descricao é obrigatório.' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada.' }, { status: 500 })

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nDescrição:\n${descricao.slice(0, 4000)}`)
    const raw = result.response.text()

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Resposta não contém JSON válido')
    const pistas = JSON.parse(match[0])

    return NextResponse.json({ pistas })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[Gemini]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
