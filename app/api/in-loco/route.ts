import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await sql`
    SELECT id, lat, lng, endereco, telefone, tipo_imovel, obs, foto_url, status, criado_em
    FROM leads_in_loco
    ORDER BY criado_em DESC
    LIMIT 100
  `
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const str = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return s || null }
  const lat = typeof b.lat === 'number' ? b.lat : null
  const lng = typeof b.lng === 'number' ? b.lng : null
  const endereco = str(b.endereco)
  if (!endereco) return NextResponse.json({ error: 'endereço obrigatório' }, { status: 400 })

  try {
    const r = await sql`
      INSERT INTO leads_in_loco (lat, lng, endereco, endereco_fonte, telefone, tipo_imovel, obs, foto_url)
      VALUES (${lat}, ${lng}, ${endereco}, ${str(b.fonte)}, ${str(b.telefone)}, ${str(b.tipo_imovel)}, ${str(b.obs)}, ${str(b.foto_url)})
      RETURNING id
    `
    return NextResponse.json({ ok: true, id: r[0].id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro no banco' }, { status: 500 })
  }
}
