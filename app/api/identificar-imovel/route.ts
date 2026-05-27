import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import sql from '@/lib/db'

const MODEL = 'gemini-2.0-flash'
const MAX_REFS = 10

type Tipo = 'fachada' | 'satelite' | 'telhado' | 'piscina' | 'outro'

type Referencia = {
  id: string
  endereco_conhecido: string
  endereco_wfs: string | null
  foto_url: string
  tipo: Tipo
}

type Ranking = {
  endereco: string
  endereco_wfs: string | null
  ref_id: string
  ref_foto_url: string
  confianca: 'alta' | 'media' | 'baixa'
  motivo: string
}

async function urlParaInline(url: string): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const buf = await r.arrayBuffer()
    return {
      inlineData: {
        data: Buffer.from(buf).toString('base64'),
        mimeType: r.headers.get('content-type') ?? 'image/jpeg',
      },
    }
  } catch {
    return null
  }
}

async function classificarTipo(
  genai: GoogleGenerativeAI,
  testePart: { inlineData: { data: string; mimeType: string } },
): Promise<Tipo> {
  try {
    const model = genai.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            text: `Olhe esta imagem de imóvel e classifique o ângulo em UMA opção:
- fachada: foto da frente do imóvel vista da rua
- satelite: foto aérea/satélite do lote
- telhado: vista do telhado por drone (não satélite)
- piscina: foto da piscina/área de lazer
- outro: interior, jardim, detalhe ou não identificado

Retorne SOMENTE JSON válido sem markdown: {"tipo":"fachada"}`,
          },
          testePart,
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    })
    const parsed = JSON.parse(result.response.text()) as { tipo?: string }
    const valid: Tipo[] = ['fachada', 'satelite', 'telhado', 'piscina', 'outro']
    return valid.includes(parsed.tipo as Tipo) ? (parsed.tipo as Tipo) : 'outro'
  } catch {
    return 'outro'
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('foto') as File | null
    const rua  = String(form.get('rua') ?? '').trim() || null
    const tipoForcado = String(form.get('tipo') ?? '').trim() || null

    if (!file) return NextResponse.json({ error: 'Foto é obrigatória' }, { status: 400 })

    const key = process.env.GEMINI_API_KEY
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 })

    const testeBuf = Buffer.from(await file.arrayBuffer())
    const testePart = {
      inlineData: {
        data: testeBuf.toString('base64'),
        mimeType: file.type || 'image/jpeg',
      },
    }

    const genai = new GoogleGenerativeAI(key)

    // Classifica o tipo da foto se não foi informado — evita comparar fachada contra satélite
    const tipoDetectado: Tipo | null = tipoForcado
      ? (tipoForcado as Tipo)
      : await classificarTipo(genai, testePart)

    // 'outro' ou falha na classificação → não filtra por tipo (busca mais ampla)
    const tipoFiltro = tipoDetectado === 'outro' ? null : tipoDetectado

    const conds: string[] = []
    const params: string[] = []
    if (tipoFiltro) { params.push(tipoFiltro); conds.push(`tipo = $${params.length}`) }
    if (rua)        { params.push(rua);         conds.push(`rua = $${params.length}`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const refs = await sql.unsafe<Referencia[]>(
      `SELECT id, endereco_conhecido, endereco_wfs, foto_url, tipo
       FROM referencias_visuais
       ${where}
       ORDER BY criado_em
       LIMIT ${MAX_REFS}`,
      params,
    )

    if (refs.length === 0) {
      return NextResponse.json({
        error: `Nenhuma referência encontrada${tipoFiltro ? ` do tipo "${tipoFiltro}"` : ''}${rua ? ` na rua "${rua}"` : ''}`,
        tipo_detectado: tipoDetectado,
      }, { status: 404 })
    }

    const refsParts = await Promise.all(refs.map(r => urlParaInline(r.foto_url)))
    const refsValidas = refs
      .map((r, i) => ({ ref: r, part: refsParts[i] }))
      .filter((x): x is { ref: Referencia; part: NonNullable<typeof x.part> } => x.part !== null)

    if (refsValidas.length === 0) {
      return NextResponse.json({ error: 'Não foi possível carregar nenhuma imagem de referência' }, { status: 500 })
    }

    const refsDescritas = refsValidas.map((x, i) =>
      `Referência #${i + 1}: endereço="${x.ref.endereco_conhecido}" tipo=${x.ref.tipo}`
    ).join('\n')

    const prompt = `Você é especialista em identificação visual de imóveis no Lago Sul, Brasília-DF.

A PRIMEIRA imagem é a foto de TESTE — quero descobrir qual imóvel é.

As imagens seguintes são REFERÊNCIAS (tipo: ${tipoFiltro ?? 'variados'}), cada uma com endereço conhecido:
${refsDescritas}

Compare a foto de teste contra cada referência considerando:
- Forma e cor do telhado
- Forma e posição da piscina (se visível)
- Fachada: arquitetura, cor, portão, muro
- Vegetação característica
- Disposição do lote

Retorne JSON com top 3 candidatos mais prováveis (ou menos se nenhum bater bem). Formato estrito:

{
  "candidatos": [
    {
      "ref_index": 1,
      "confianca": "alta" | "media" | "baixa",
      "motivo": "breve explicação visual"
    }
  ],
  "observacoes": "opcional, se vc não achar match plausível"
}

Se a foto de teste não der pra identificar visualmente, retorne candidatos vazio e explique em observacoes.

Retorne SOMENTE JSON válido, sem markdown.`

    const model = genai.getGenerativeModel({ model: MODEL })
    const parts = [
      { text: prompt },
      testePart,
      ...refsValidas.map(x => x.part),
    ]

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json' },
    })

    const raw = result.response.text()
    let parsed: { candidatos?: Array<{ ref_index: number; confianca: string; motivo: string }>; observacoes?: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Gemini retornou JSON inválido', raw }, { status: 500 })
    }

    const candidatos = parsed.candidatos ?? []
    const ranking: Ranking[] = candidatos
      .filter(c => c.ref_index >= 1 && c.ref_index <= refsValidas.length)
      .map(c => {
        const { ref } = refsValidas[c.ref_index - 1]
        return {
          endereco: ref.endereco_conhecido,
          endereco_wfs: ref.endereco_wfs,
          ref_id: ref.id,
          ref_foto_url: ref.foto_url,
          confianca: (c.confianca as Ranking['confianca']) ?? 'baixa',
          motivo: c.motivo ?? '',
        }
      })

    return NextResponse.json({
      total_refs: refsValidas.length,
      tipo_detectado: tipoDetectado,
      ranking,
      observacoes: parsed.observacoes ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[identificar-imovel]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
