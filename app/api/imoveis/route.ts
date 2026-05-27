import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { log } from '@/lib/logger'

const ALLOWED_TABLES = ['imoveis_olx', 'imoveis_dfimoveis', 'imoveis_wimoveis', 'imoveis_facebook'] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

// Mirrors scraper/storage/supabase.py SCHEMA_COLUMNS
const SCHEMA_COLUMNS: Record<AllowedTable, string[]> = {
  imoveis_olx: [
    'link', 'titulo', 'preco', 'area_m2', 'quartos', 'suites', 'vagas', 'banheiros',
    'bairro', 'cidade', 'estado', 'tipo_imovel', 'descricao', 'telefone',
    'nome_anunciante', 'tipo_anunciante', 'id_anuncio', 'data_publicacao',
    'dados_brutos', 'coletado_em', 'atualizado_em', 'preco_reduzido',
    'bairro_id', 'ativo', 'creci', 'tipo', 'imagens',
  ],
  imoveis_dfimoveis: [
    'link', 'titulo', 'preco', 'area_m2', 'quartos', 'suites', 'vagas',
    'bairro', 'cidade', 'estado', 'tipo_imovel', 'descricao', 'telefone',
    'nome_anunciante', 'tipo_anunciante', 'id_anuncio', 'data_publicacao',
    'dados_brutos', 'coletado_em', 'atualizado_em', 'validado_em',
    'ativo', 'creci', 'tipo', 'imagens',
  ],
  imoveis_wimoveis: [
    'link', 'titulo', 'preco', 'area_m2', 'quartos', 'suites', 'vagas', 'banheiros',
    'bairro', 'cidade', 'estado', 'tipo_imovel', 'descricao', 'telefone',
    'nome_anunciante', 'tipo_anunciante', 'id_anuncio', 'data_publicacao',
    'dados_brutos', 'coletado_em', 'atualizado_em', 'preco_reduzido',
    'bairro_id', 'ativo', 'creci', 'tipo', 'imagens',
  ],
  imoveis_facebook: [
    'link', 'titulo', 'preco', 'area_m2', 'quartos', 'suites', 'vagas', 'banheiros',
    'bairro', 'cidade', 'estado', 'tipo_imovel', 'descricao', 'telefone',
    'nome_anunciante', 'tipo_anunciante', 'id_anuncio', 'data_publicacao',
    'dados_brutos', 'coletado_em', 'atualizado_em', 'preco_reduzido',
    'bairro_id', 'ativo', 'creci', 'tipo', 'imagens',
  ],
}

function portalToTable(portal: string): AllowedTable | null {
  const map: Record<string, AllowedTable> = {
    olx: 'imoveis_olx',
    dfimoveis: 'imoveis_dfimoveis',
    wimoveis: 'imoveis_wimoveis',
    facebook: 'imoveis_facebook',
  }
  return map[portal.toLowerCase()] ?? null
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  if (apiKey !== process.env.SCRAPER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { portal: string; items: Record<string, unknown>[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { portal, items } = body
  if (!portal || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'portal and items[] required' }, { status: 400 })
  }

  const table = portalToTable(portal)
  if (!table) {
    return NextResponse.json({ error: `Unknown portal: ${portal}` }, { status: 400 })
  }

  const allowedCols = SCHEMA_COLUMNS[table]

  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const item of items) {
    // Keep only whitelisted columns; convert undefined → null
    const filtered: Record<string, unknown> = {}
    for (const col of allowedCols) {
      if (col in item) filtered[col] = item[col] ?? null
    }
    if (!filtered.link) {
      errors.push('item sem link, pulado')
      continue
    }

    const cols = Object.keys(filtered)
    const vals = Object.values(filtered)

    // Columns and table name are from hardcoded whitelist — sql.unsafe is safe here
    const setClauses = cols
      .filter(c => c !== 'link')
      .map(c => `"${c}" = EXCLUDED."${c}"`)
      .join(', ')

    const colList = cols.map(c => `"${c}"`).join(', ')
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')

    try {
      const result = await sql.unsafe(
        `INSERT INTO public."${table}" (${colList})
         VALUES (${placeholders})
         ON CONFLICT (link) DO UPDATE SET ${setClauses}
         RETURNING (xmax = 0) AS is_insert`,
        vals as never[],
      )
      if (result[0]?.is_insert) inserted++
      else updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`link=${filtered.link}: ${msg}`)
    }
  }

  await log('info', 'scraper-ingest', 'Lote recebido', {
    portal, count: items.length, inseridos: inserted, atualizados: updated, erros: errors.length,
  })

  return NextResponse.json({ ok: true, inserted, updated, errors })
}
