import { NextRequest, NextResponse } from 'next/server'

const PIPE_ID   = process.env.PIPEFY_PIPE_ID   ?? '307179010'
const GQL_URL   = 'https://api.pipefy.com/graphql'

// Normaliza bairro para os options do pipe
const BAIRRO_MAP: Record<string, string> = {
  'asa-sul':          'Asa Sul',
  'asa sul':          'Asa Sul',
  'asa_sul':          'Asa Sul',
  'asa norte':        'Asa Norte',
  'asa-norte':        'Asa Norte',
  'asa_norte':        'Asa Norte',
  'lago sul':         'Lago Sul',
  'lago-sul':         'Lago Sul',
  'lago_sul':         'Lago Sul',
  'lago norte':       'Lago Norte',
  'lago-norte':       'Lago Norte',
  'lago_norte':       'Lago Norte',
  'sudoeste':         'Sudoeste',
  'noroeste':         'Noroeste',
  'park way':         'Park Way',
  'park-way':         'Park Way',
  'parkway':          'Park Way',
  'park sul':         'Park Sul',
  'park-sul':         'Park Sul',
  'park_sul':         'Park Sul',
  'vila planalto':    'Vila Planalto',
  'jardim botanico':  null as unknown as string,
  'jardim-botanico':  null as unknown as string,
  'cruzeiro':         null as unknown as string,
}

const TIPO_MAP: Record<string, string> = {
  'apartamento': 'Apartamento',
  'apto':        'Apartamento',
  'casa':        'Casa',
  'sobrado':     'Casa',
  'terreno':     'Terreno',
  'lote':        'Terreno',
  'comercial':   'Comercial',
  'sala':        'Comercial',
  'loja':        'Comercial',
  'escritorio':  'Comercial',
  'galpao':      'Galpão',
  'galpão':      'Galpão',
}

function normalizeBairro(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  if (key in BAIRRO_MAP) return BAIRRO_MAP[key]
  // try partial match
  for (const [k, v] of Object.entries(BAIRRO_MAP)) {
    if (v && key.includes(k)) return v
  }
  return null
}

function normalizeTipo(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  return TIPO_MAP[key] ?? null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

async function pipefyGql(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Pipefy HTTP ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

export async function POST(req: NextRequest) {
  const token = process.env.PIPEFY_TOKEN
  if (!token) return NextResponse.json({ error: 'PIPEFY_TOKEN não configurado' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Monta endereço obrigatório
  const bairroNorm = normalizeBairro(body.bairro as string | null)
  const tipoNorm   = normalizeTipo(body.tipo_imovel as string | null)
  const endereco   = [
    body.endereco ?? body.titulo ?? tipoNorm ?? 'Imóvel',
    bairroNorm ?? body.bairro ?? '',
  ].filter(Boolean).join(' — ')

  const fields: { field_id: string; field_value: string }[] = [
    { field_id: 'endere_o_1',              field_value: String(endereco) },
    { field_id: 'origem_da_oportunidade_1', field_value: 'Portal' },
  ]

  const preco = num(body.preco)
  if (preco)            fields.push({ field_id: 'valor_estimado_1',    field_value: String(preco) })
  const area = num(body.area_m2)
  if (area)             fields.push({ field_id: 'metragem_tamanho_1',  field_value: String(area) })
  if (body.link)        fields.push({ field_id: 'link_de_an_ncio',     field_value: String(body.link) })
  if (body.maps_link)   fields.push({ field_id: 'link_de_localiza_o',  field_value: String(body.maps_link) })
  if (body.telefone)    fields.push({ field_id: 'telefone_contato_1',  field_value: String(body.telefone) })
  if (body.nome_anunciante) fields.push({ field_id: 'nome_do_propriet_rio_1', field_value: String(body.nome_anunciante) })
  if (bairroNorm)       fields.push({ field_id: 'bairro_1',            field_value: bairroNorm })
  if (tipoNorm)         fields.push({ field_id: 'tipo_de_im_vel_1',    field_value: tipoNorm })

  const mutation = `
    mutation CreateCard($input: CreateCardInput!) {
      createCard(input: $input) {
        card { id title url }
      }
    }
  `
  const variables = {
    input: {
      pipe_id:           PIPE_ID,
      fields_attributes: fields,
    },
  }

  try {
    const data = await pipefyGql(token, mutation, variables) as {
      createCard: { card: { id: string; title: string; url: string } }
    }
    const card = data.createCard.card
    console.log(`[api/pipefy/card] criado card ${card.id}: ${card.title}`)
    return NextResponse.json({ ok: true, card_id: card.id, title: card.title, url: card.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/pipefy/card]', msg)
    // Token expirado → instrução clara
    if (msg.includes('invalid_token') || msg.includes('401') || msg.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Token Pipefy expirado. Rode scripts/pipefy_auth_setup.py para renovar.' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
