import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarLotePorPonto } from '@/lib/wfs-idedf'
import sql from '@/lib/db'

const TIPOS = new Set(['fachada', 'satelite', 'telhado', 'piscina', 'outro'])
const EXT_POR_MIME: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file              = form.get('foto') as File | null
    const rua               = String(form.get('rua') ?? '').trim()
    const lat               = parseFloat(String(form.get('lat') ?? ''))
    const lng               = parseFloat(String(form.get('lng') ?? ''))
    const enderecoConhecido = String(form.get('endereco_conhecido') ?? '').trim()
    const tipo              = String(form.get('tipo') ?? '').trim()
    const observacoes       = String(form.get('observacoes') ?? '').trim() || null

    if (!file)               return NextResponse.json({ error: 'Foto é obrigatória' }, { status: 400 })
    if (!rua)                return NextResponse.json({ error: 'Rua é obrigatória' }, { status: 400 })
    if (!enderecoConhecido)  return NextResponse.json({ error: 'Endereço conhecido é obrigatório' }, { status: 400 })
    if (Number.isNaN(lat) || Number.isNaN(lng)) return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
    if (!TIPOS.has(tipo))    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

    const ext = EXT_POR_MIME[file.type] ?? 'png'
    const slugRua = rua.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const path = `${slugRua || 'rua'}/${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}.${ext}`

    const supabase = await createClient()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from('referencias-visuais')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`)

    const { data: { publicUrl } } = supabase.storage
      .from('referencias-visuais')
      .getPublicUrl(path)

    const wfs = await consultarLotePorPonto(lat, lng).catch(err => ({
      encontrado: false, aproximado: false,
      endereco_siturb: null, endereco_cart: null,
      lote: null,
      bruto: { erro: err instanceof Error ? err.message : String(err) },
    }))
    const wfsDados = wfs.encontrado ? wfs.lote : wfs.bruto

    const [row] = await sql.unsafe(
      `INSERT INTO referencias_visuais (
        rua, lat, lng, endereco_conhecido,
        endereco_wfs, endereco_cart, wfs_aproximado, wfs_dados,
        foto_url, foto_path, tipo, observacoes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
      RETURNING *`,
      [
        rua, lat, lng, enderecoConhecido,
        wfs.endereco_siturb, wfs.endereco_cart, wfs.aproximado, JSON.stringify(wfsDados),
        publicUrl, path, tipo, observacoes,
      ],
    )

    return NextResponse.json({ referencia: row })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[referencias-visuais POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rua  = searchParams.get('rua')
    const tipo = searchParams.get('tipo')

    const conds: string[] = []
    const params: string[] = []
    if (rua)  { params.push(rua);  conds.push(`rua = $${params.length}`) }
    if (tipo) { params.push(tipo); conds.push(`tipo = $${params.length}`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const rows = await sql.unsafe(
      `SELECT id, rua, lat, lng, endereco_conhecido,
              endereco_wfs, endereco_cart, wfs_aproximado, wfs_dados,
              foto_url, foto_path, tipo, observacoes, criado_em
       FROM referencias_visuais
       ${where}
       ORDER BY criado_em DESC
       LIMIT 500`,
      params,
    )
    return NextResponse.json({ referencias: rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
