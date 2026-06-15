import sql from '@/lib/db'

export async function GET() {
  const rows = await sql<[{ count: number }]>`
    SELECT COUNT(*)::int AS count
    FROM imoveis_todos
    WHERE status_triagem = 'para_visitar'
      AND visitado_em IS NULL
  `
  return Response.json({ count: rows[0]?.count ?? 0 })
}
