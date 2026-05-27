import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import sql from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const [row] = await sql<{ foto_path: string }[]>`
      SELECT foto_path FROM referencias_visuais WHERE id = ${id}
    `
    if (!row) return NextResponse.json({ error: 'não encontrado' }, { status: 404 })

    const supabase = await createClient()
    await supabase.storage.from('referencias-visuais').remove([row.foto_path])
    await sql`DELETE FROM referencias_visuais WHERE id = ${id}`

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
