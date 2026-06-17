// Sync de 1 card do Pipefy → tabela pipefy_captacoes (UPSERT por evento de webhook).
// Espelha o mapeamento do scripts/pipefy_sync.py (full-refresh do cron), mas por card.
import sql from '@/lib/db'

const GQL_URL = 'https://api.pipefy.com/graphql'

// label EXATO do Pipefy → [coluna, tipo]
const FIELD_MAP: Record<string, [string, 'str' | 'money' | 'date']> = {
  'Endereço': ['endereco', 'str'],
  'Origem da Oportunidade': ['origem_oportunidade', 'str'],
  'Metragem/Tamanho': ['metragem', 'str'],
  'Link de Localização': ['link_localizacao', 'str'],
  'Link de anúncio': ['links_anuncio', 'str'],
  'Matrícula': ['matricula', 'str'],
  'Nome do Proprietário': ['nome_proprietario', 'str'],
  'Idade': ['idade', 'str'],
  'Telefone/Contato': ['telefone_contato', 'str'],
  'Outros Contatos': ['outros_contatos', 'str'],
  'E-mail': ['email', 'str'],
  'Bairro': ['bairro', 'str'],
  'Tipo de Imóvel': ['tipo_imovel', 'str'],
  'Ônus': ['onus', 'str'],
  'VK': ['tem_nido', 'str'],
  'Valor Estimado': ['valor_estimado', 'money'],
  'Data de Contato': ['data_contato', 'date'],
  'Houve abertura do proprietário?': ['abertura_proprietario', 'str'],
  'Observações': ['observacoes', 'str'],
  'Urgência': ['urgencia', 'str'],
  'Status do Lead': ['status_lead', 'str'],
  'Status': ['status', 'str'],
  'Motivo da não captação': ['motivo_nao_captacao', 'str'],
  'Atividades Realizadas': ['atividades_realizadas', 'str'],
  'Observações da Visita': ['obs_visita', 'str'],
  'Objeções Comerciais Registradas': ['objecoes_comerciais', 'str'],
  'Oportunidades com contrato de administração': ['contrato_administracao', 'str'],
}

const PHASE_MAP: Record<string, string> = {
  'Informações Básicas': 'info_basicas',
  'Qualificação': 'qualificacao',
  'Negociação': 'negociacao',
  'Captado': 'captado',
  'Não Captado': 'nao_captado',
}

const CARD_QUERY = `
query Card($id: ID!) {
  card(id: $id) {
    id title current_phase { name } labels { name }
    due_date created_at updated_at finished_at expired
    assignees { name } createdBy { name }
    fields { field { label } value date_value datetime_value float_value }
    phases_history { phase { name } firstTimeIn lastTimeOut duration }
  }
}`

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const ts = (v: string | null | undefined): string | null =>
  !v ? null : (v.endsWith('Z') ? v.replace('Z', '+00:00') : v)

async function fetchCard(token: string, id: string): Promise<any | null> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: CARD_QUERY, variables: { id } }),
  })
  if (!res.ok) throw new Error(`Pipefy HTTP ${res.status}`)
  const json = await res.json() as { data?: { card?: any }; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data?.card ?? null
}

function mapCard(card: any): Record<string, unknown> {
  const fields: Record<string, any> = {}
  for (const f of (card.fields ?? [])) fields[f.field?.label] = f
  const phases: Record<string, any> = {}
  for (const ph of (card.phases_history ?? [])) if (ph.phase) phases[ph.phase.name] = ph

  const phDays = (p: string): number | null => {
    const ph = phases[p]; if (!ph) return null
    if (ph.duration != null) return Math.round((Number(ph.duration) / 1440) * 100) / 100
    const first = ts(ph.firstTimeIn); if (!first) return null
    try {
      const t0 = new Date(first).getTime()
      const t1 = ph.lastTimeOut ? new Date(ts(ph.lastTimeOut)!).getTime() : Date.now()
      return Math.round(((t1 - t0) / 86400000) * 100) / 100
    } catch { return null }
  }

  const row: Record<string, unknown> = {
    card_id: parseInt(card.id, 10),
    titulo: card.title ?? null,
    fase_atual: card.current_phase?.name ?? null,
    etiquetas: (card.labels ?? []).map((l: any) => l.name).join(', ') || null,
    data_vencimento: card.due_date ?? null,
    criador: card.createdBy?.name ?? null,
    responsaveis: (card.assignees ?? []).map((a: any) => a.name).join(', ') || null,
    finalizado_em: ts(card.finished_at),
    criado_em: ts(card.created_at),
    atualizado_em: ts(card.updated_at),
    vencido: card.expired ? 'Sim' : 'Não',
    sincronizado_em: new Date().toISOString(),
  }
  for (const [label, [col, kind]] of Object.entries(FIELD_MAP)) {
    const f = fields[label]
    if (kind === 'money') row[col] = f ? parseMoney(f.float_value ?? f.value) : null
    else if (kind === 'date') row[col] = f ? (f.date_value ?? f.datetime_value ?? f.value ?? null) : null
    else row[col] = f ? (f.value || null) : null
  }
  for (const [fase, prefix] of Object.entries(PHASE_MAP)) {
    row[`${prefix}_entrada`] = ts(phases[fase]?.firstTimeIn)
    row[`${prefix}_saida`] = ts(phases[fase]?.lastTimeOut)
    row[`${prefix}_dias`] = phDays(fase)
  }
  return row
}

async function upsert(row: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(row)
  const updates = cols.filter(c => c !== 'card_id')
  await sql.unsafe(
    `INSERT INTO public.pipefy_captacoes (${cols.map(c => `"${c}"`).join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (card_id) DO UPDATE SET ${updates.map(c => `"${c}"=EXCLUDED."${c}"`).join(', ')}`,
    cols.map(c => row[c] as never),
  )
}

/** Busca 1 card no Pipefy e faz upsert em pipefy_captacoes. Retorna o título (ou null se sumiu). */
export async function syncCardById(cardId: string | number): Promise<string | null> {
  const token = process.env.PIPEFY_TOKEN
  if (!token) throw new Error('PIPEFY_TOKEN não configurado')
  const card = await fetchCard(token, String(cardId))
  if (!card) { await deleteCard(cardId); return null }  // card sumiu → remove
  const row = mapCard(card)
  await upsert(row)
  return (row.titulo as string) ?? null
}

export async function deleteCard(cardId: string | number): Promise<void> {
  await sql.unsafe(`DELETE FROM public.pipefy_captacoes WHERE card_id = $1`, [parseInt(String(cardId), 10) as never])
}
