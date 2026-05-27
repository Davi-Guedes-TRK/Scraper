import sql from '@/lib/db'
import { redis } from '@/lib/redis'

type Check = { ok: boolean; latencia_ms?: number; detalhe?: string }

async function checkDb(): Promise<Check> {
  const t = Date.now()
  try {
    await sql`SELECT 1`
    return { ok: true, latencia_ms: Date.now() - t }
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) }
  }
}

async function checkRedis(): Promise<Check> {
  const t = Date.now()
  try {
    await redis.set('health:ping', '1', { ex: 10 })
    return { ok: true, latencia_ms: Date.now() - t }
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) }
  }
}

async function checkScraper(): Promise<Check & { ultimo_registro?: string; horas_desde_ultimo?: number }> {
  try {
    const rows = await sql<{ coletado_em: string }[]>`
      SELECT MAX(coletado_em) AS coletado_em FROM imoveis_todos
    `
    const ultimo = rows[0]?.coletado_em
    if (!ultimo) return { ok: false, detalhe: 'Nenhum registro no banco' }
    const horasDesde = (Date.now() - new Date(ultimo).getTime()) / 3_600_000
    return {
      ok: horasDesde < 26,
      ultimo_registro: ultimo,
      horas_desde_ultimo: Math.round(horasDesde * 10) / 10,
      detalhe: horasDesde >= 26 ? `Último registro há ${Math.round(horasDesde)}h` : undefined,
    }
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const [db, cache, scraper] = await Promise.all([checkDb(), checkRedis(), checkScraper()])

  const tudo_ok = db.ok && scraper.ok

  const body = {
    status: tudo_ok ? 'ok' : 'degradado',
    timestamp: new Date().toISOString(),
    checks: { db, redis: cache, scraper },
  }

  return Response.json(body, { status: tudo_ok ? 200 : 503 })
}
