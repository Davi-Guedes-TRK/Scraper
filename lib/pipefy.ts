// Lógica compartilhada de criação de card no Pipefy "COM - Oportunidades".
// Usada por /api/pipefy/card (Triagem) e /api/cartorio/inbound (automação de e-mail).

const PIPE_ID = process.env.PIPEFY_PIPE_ID ?? '307179010'
const GQL_URL = 'https://api.pipefy.com/graphql'

const BAIRRO_MAP: Record<string, string | null> = {
  'asa-sul': 'Asa Sul', 'asa sul': 'Asa Sul',
  'asa norte': 'Asa Norte', 'asa-norte': 'Asa Norte',
  'lago sul': 'Lago Sul', 'lago-sul': 'Lago Sul',
  'lago norte': 'Lago Norte', 'lago-norte': 'Lago Norte',
  'sudoeste': 'Sudoeste', 'noroeste': 'Noroeste',
  'park way': 'Park Way', 'park-way': 'Park Way', 'parkway': 'Park Way',
  'park sul': 'Park Sul', 'park-sul': 'Park Sul',
  'vila planalto': 'Vila Planalto',
  'jardim botanico': null, 'jardim-botanico': null, 'cruzeiro': null,
}

const TIPO_MAP: Record<string, string> = {
  'apartamento': 'Apartamento', 'apto': 'Apartamento',
  'casa': 'Casa', 'sobrado': 'Casa',
  'terreno': 'Terreno', 'lote': 'Terreno',
  'comercial': 'Comercial', 'sala': 'Comercial', 'loja': 'Comercial',
  'escritorio': 'Comercial', 'galpao': 'Galpão', 'galpão': 'Galpão',
}

function normBairro(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  if (key in BAIRRO_MAP) return BAIRRO_MAP[key]
  for (const [k, v] of Object.entries(BAIRRO_MAP)) {
    if (v && key.includes(k)) return v
  }
  return null
}

function normTipo(raw: string | null): string | null {
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

async function gql(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Pipefy HTTP ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

export type ImovelParaCard = {
  link?: string | null
  titulo?: string | null
  bairro?: string | null
  cidade?: string | null
  preco?: string | null
  area_m2?: string | number | null
  tipo_imovel?: string | null
  tipo?: string | null
  telefone?: string | null
  nome_anunciante?: string | null
  endereco?: string | null
  maps_link?: string | null
  numero_matricula?: string | null
}

export type CardCriado = { id: string; title: string; url: string }

export async function criarCardOportunidade(imovel: ImovelParaCard): Promise<CardCriado> {
  const token = process.env.PIPEFY_TOKEN
  if (!token) throw new Error('PIPEFY_TOKEN não configurado')

  const bairroNorm = normBairro(imovel.cidade ?? null) ?? normBairro(imovel.bairro ?? null)
  const tipoNorm   = normTipo(imovel.tipo_imovel ?? null) ?? normTipo(imovel.tipo ?? null)
  const endereco   = [
    imovel.endereco ?? imovel.titulo ?? tipoNorm ?? 'Imóvel',
    bairroNorm ?? imovel.bairro ?? '',
  ].filter(Boolean).join(' — ')

  const fields: { field_id: string; field_value: string }[] = [
    { field_id: 'endere_o_1',               field_value: String(endereco) },
    { field_id: 'origem_da_oportunidade_1',  field_value: 'Portal' },
  ]

  const preco = num(imovel.preco)
  if (preco)                   fields.push({ field_id: 'valor_estimado_1',        field_value: String(preco) })
  const area = num(imovel.area_m2)
  if (area)                    fields.push({ field_id: 'metragem_tamanho_1',       field_value: String(area) })
  if (imovel.link)             fields.push({ field_id: 'link_de_an_ncio',          field_value: String(imovel.link) })
  if (imovel.maps_link)        fields.push({ field_id: 'link_de_localiza_o',       field_value: String(imovel.maps_link) })
  if (imovel.telefone)         fields.push({ field_id: 'telefone_contato_1',       field_value: String(imovel.telefone) })
  if (imovel.nome_anunciante)  fields.push({ field_id: 'nome_do_propriet_rio_1',   field_value: String(imovel.nome_anunciante) })
  if (bairroNorm)              fields.push({ field_id: 'bairro_1',                 field_value: bairroNorm })
  if (tipoNorm)                fields.push({ field_id: 'tipo_de_im_vel_1',         field_value: tipoNorm })
  if (imovel.numero_matricula) fields.push({ field_id: 'matr_cula',                field_value: String(imovel.numero_matricula) })

  const mutation = `
    mutation CreateCard($input: CreateCardInput!) {
      createCard(input: $input) { card { id title url } }
    }
  `
  const data = await gql(token, mutation, { input: { pipe_id: PIPE_ID, fields_attributes: fields } }) as {
    createCard: { card: CardCriado }
  }
  return data.createCard.card
}
