import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const digits = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(digits)
  return Number.isFinite(n) ? n : null
}

const FASE_PREFIXES = [
  'leads', 'em_contato', 'lead_completo', 'visita', 'captacao_realizada',
  'avaliacao', 'fechado', 'matricula_solicitada', 'onus_solicitada',
  'nao_captado', 'locado',
]

const TS_COLS = [
  'finalizado_em', 'criado_em', 'atualizado_em',
  ...FASE_PREFIXES.flatMap(p => [`${p}_entrada`, `${p}_saida`]),
]

const NUM_COLS = [
  'valor_anuncio',
  ...FASE_PREFIXES.map(p => `${p}_dias`),
]

const TEXT_COLS = [
  'titulo', 'fase_atual', 'etiquetas', 'data_vencimento', 'criador',
  'responsaveis', 'vencido', 'bairro', 'localizacao', 'endereco_imovel',
  'links_anuncio', 'nome_proprietario', 'telefone_contato', 'outros_contatos',
  'email', 'inicio_levantamento', 'tipo_imovel', 'valor_locacao_desejado',
  'status_captacao', 'checklist', 'codigo_fac', 'codigo_imovel',
  'solicitar_onus', 'onus', 'data_contato', 'obs_contato', 'visita_agendada',
  'obs_visita', 'fotos_documentos', 'valor_avaliacao', 'avaliacao',
  'data_captacao', 'obs_captacao', 'contrato_assinado', 'data_assinatura_contrato',
  'motivo_nao_captacao', 'obs_nao_captacao', 'contato_validado', 'data_locado',
  'motivos_secundarios', 'matricula', 'vk_nido', 'corretor',
  'endereco_completo', 'meu_interesse',
]

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-api-key')
  const expected = process.env.PIPEFY_API_KEY || process.env.SCRAPER_API_KEY
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const cardId = num(body.card_id)
  if (!cardId) {
    return NextResponse.json({ error: 'card_id obrigatório' }, { status: 400 })
  }

  const cols = ['card_id', ...TEXT_COLS, ...TS_COLS, ...NUM_COLS, 'sincronizado_em']
  const vals: unknown[] = [
    cardId,
    ...TEXT_COLS.map(c => str(body[c])),
    ...TS_COLS.map(c => str(body[c])),
    ...NUM_COLS.map(c => num(body[c])),
    new Date().toISOString(),
  ]

  const colList = cols.map(c => `"${c}"`).join(', ')
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const setClause = cols.filter(c => c !== 'card_id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')

  try {
    const result = await sql.unsafe(
      `INSERT INTO public.pipefy_captacoes (${colList})
       VALUES (${placeholders})
       ON CONFLICT (card_id) DO UPDATE SET ${setClause}
       RETURNING (xmax = 0) AS is_insert`,
      vals as never[],
    )
    const inserted = !!result[0]?.is_insert
    console.log(`[api/pipefy] card ${cardId}: ${inserted ? 'inserido' : 'atualizado'}`)
    return NextResponse.json({ ok: true, card_id: cardId, inserted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/pipefy]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
