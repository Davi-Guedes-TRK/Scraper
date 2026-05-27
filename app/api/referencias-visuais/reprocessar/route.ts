import { NextResponse } from 'next/server'
import { consultarLotePorPonto } from '@/lib/wfs-idedf'
import sql from '@/lib/db'

type Pendente = {
  id: string
  lat: number
  lng: number
}

export async function POST() {
  try {
    const pendentes = await sql<Pendente[]>`
      SELECT id, lat::float AS lat, lng::float AS lng
      FROM referencias_visuais
      WHERE endereco_wfs IS NULL
      ORDER BY criado_em
    `

    const resultados: Array<{ id: string; ok: boolean; endereco_wfs: string | null; aproximado: boolean }> = []

    for (const r of pendentes) {
      try {
        const wfs = await consultarLotePorPonto(r.lat, r.lng)
        const wfsDados = wfs.encontrado ? wfs.lote : wfs.bruto

        await sql.unsafe(
          `UPDATE referencias_visuais
           SET endereco_wfs    = $1,
               endereco_cart   = $2,
               wfs_aproximado  = $3,
               wfs_dados       = $4::jsonb
           WHERE id = $5`,
          [wfs.endereco_siturb, wfs.endereco_cart, wfs.aproximado, JSON.stringify(wfsDados), r.id],
        )
        resultados.push({
          id: r.id,
          ok: !!wfs.endereco_siturb,
          endereco_wfs: wfs.endereco_siturb,
          aproximado: wfs.aproximado,
        })
      } catch (err) {
        resultados.push({
          id: r.id,
          ok: false,
          endereco_wfs: null,
          aproximado: false,
        })
        console.error('[reprocessar]', r.id, err)
      }

      // pequeno respiro entre chamadas WFS
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({
      total: pendentes.length,
      resolvidos: resultados.filter(r => r.ok).length,
      aproximados: resultados.filter(r => r.aproximado).length,
      ainda_sem_lote: resultados.filter(r => !r.ok).length,
      resultados,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
