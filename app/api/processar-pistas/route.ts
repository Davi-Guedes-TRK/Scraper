import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { extractFromText } from '@/lib/extrair-pistas'
import { portalTable } from '@/lib/portals'
import { redis } from '@/lib/redis'
import { log, cronometro } from '@/lib/logger'

const BATCH_SIZE = 20
const DELAY_MS   = 1200  // respeita rate limit do Gemini (~50 RPM no free tier)
const LOCK_KEY   = 'processar-pistas:lock'
const LOCK_TTL   = 300   // segundos — margem para BATCH_SIZE=20 × 1.2s

type SSEEvent =
  | { type: 'start';    total: number }
  | { type: 'progress'; done: number; total: number; titulo: string }
  | { type: 'done';     processed: number; errors: number; remaining: number }
  | { type: 'error';    message: string }

export async function POST(req: NextRequest) {
  // Permite sobrescrever o limite via body (ex: { limit: 5 } pra testes)
  let limit = BATCH_SIZE
  try {
    const body = await req.json().catch(() => ({})) as { limit?: number }
    if (body.limit && body.limit > 0) limit = Math.min(body.limit, 50)
  } catch { /* usa o padrão */ }

  // Mutex — impede dois processos paralelos
  const acquired = await redis.set(LOCK_KEY, '1', { nx: true, ex: LOCK_TTL })
  if (!acquired) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'Processamento já em andamento. Aguarde terminar.' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        // Busca imóveis pendentes sem pistas, com descrição disponível
        const rows = await sql<{ link: string; portal: string; titulo: string | null; descricao: string }[]>`
          SELECT link, portal, titulo, descricao
          FROM imoveis_todos
          WHERE status_triagem = 'pendente'
            AND pistas_ia IS NULL
            AND descricao IS NOT NULL
            AND descricao != ''
          ORDER BY coletado_em DESC
          LIMIT ${limit}
        `

        if (rows.length === 0) {
          // Conta quantos ainda restam sem pistas e sem descrição
          const [{ count }] = await sql<[{ count: number }]>`
            SELECT COUNT(*)::int AS count
            FROM imoveis_todos
            WHERE status_triagem = 'pendente' AND pistas_ia IS NULL
          `
          send({ type: 'done', processed: 0, errors: 0, remaining: count })
          return  // finally cuida do del + close
        }

        const tempo = cronometro()
        await log('info', 'processar-pistas', 'Batch iniciado', { total: rows.length })
        send({ type: 'start', total: rows.length })

        let processed = 0
        let errors    = 0

        for (const row of rows) {
          send({ type: 'progress', done: processed, total: rows.length, titulo: row.titulo ?? row.link })

          const pistas = await extractFromText(row.descricao)
          if (pistas) {
            try {
              const table = portalTable(row.portal)
              await sql.unsafe(
                `UPDATE public."${table}" SET pistas_ia = $1 WHERE link = $2`,
                [JSON.stringify(pistas), row.link],
              )
              processed++
            } catch (err) {
              errors++
              await log('warn', 'processar-pistas', 'Falha ao salvar pistas', {
                link: row.link, portal: row.portal, erro: err instanceof Error ? err.message : String(err),
              })
            }
          } else {
            errors++
          }

          await new Promise(r => setTimeout(r, DELAY_MS))
        }

        // Conta restantes após o batch
        const [{ count: remaining }] = await sql<[{ count: number }]>`
          SELECT COUNT(*)::int AS count
          FROM imoveis_todos
          WHERE status_triagem = 'pendente' AND pistas_ia IS NULL
        `

        await log('info', 'processar-pistas', 'Batch concluído', { processed, errors, remaining }, tempo())
        send({ type: 'done', processed, errors, remaining })
      } catch (err) {
        await log('error', 'processar-pistas', 'Erro fatal no batch', {
          erro: err instanceof Error ? err.message : String(err),
        })
        send({ type: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
      } finally {
        await redis.del(LOCK_KEY)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection:      'keep-alive',
    },
  })
}
