import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'

const GIT_DIR = process.env.GIT_DIR ?? path.resolve(process.cwd(), '..')
const PYTHON = process.env.PYTHON_PATH ?? 'python'

const TRK_CIDADES = [
  'lago-sul', 'park-sul', 'park-way', 'asa-sul', 'asa-norte',
  'jardim-botanico', 'lago-norte', 'sudoeste', 'noroeste',
]

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[mGKHFJA-Z]/g, '')

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const portal     = p.get('portal')       ?? 'dfimoveis'
  const paginas    = p.get('paginas')      ?? '10'
  const cidade     = p.get('cidade')       ?? 'todos'
  const tipo       = p.get('tipo')         ?? 'aluguel'
  const tipoImovel = p.get('tipo_imovel')  ?? 'todos'
  const estado     = p.get('estado')       ?? 'df'
  const fast       = p.get('fast')         === 'true'
  const pubHa      = parseInt(p.get('publicados_ha') ?? '0')

  const encoder = new TextEncoder()
  let killFn: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch { /* closed */ }
      }

      const cidades = (cidade === 'trk-preset' && portal === 'dfimoveis') ? TRK_CIDADES : [cidade]

      let aborted = false
      let currentChild: ReturnType<typeof spawn> | null = null

      killFn = () => {
        aborted = true
        currentChild?.kill()
        try { controller.close() } catch { /* closed */ }
      }

      const runCidade = (cidadeSlug: string) => new Promise<number>((resolve) => {
        const args = ['main.py', portal, `--paginas=${paginas}`]
        if (fast) args.push('--fast')
        if (pubHa > 0) args.push(`--publicados-ha=${pubHa}`)
        if (portal === 'dfimoveis') args.push(`--cidade=${cidadeSlug}`, `--tipo=${tipo}`, `--tipo-imovel=${tipoImovel}`)
        else if (portal === 'olx') args.push(`--tipo=${tipo}`, `--estado=${estado}`)

        send({ type: 'start', cmd: `${PYTHON} ${args.join(' ')}`, cidade: cidadeSlug })

        const child = spawn(PYTHON, args, {
          cwd: GIT_DIR,
          env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
        })
        currentChild = child

        const onData = (data: Buffer) => {
          stripAnsi(data.toString()).split('\n').forEach(line => {
            const text = line.trimEnd()
            if (text) send({ type: 'log', text })
          })
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('close', code => resolve(code ?? 0))
        child.on('error', err => { send({ type: 'log', text: `❌ Falha: ${err.message}` }); resolve(1) })
      })

      ;(async () => {
        for (let i = 0; i < cidades.length; i++) {
          if (aborted) break
          if (cidades.length > 1) send({ type: 'log', text: `\n━━━ [${i + 1}/${cidades.length}] ${cidades[i].toUpperCase()} ━━━` })
          await runCidade(cidades[i])
          if (aborted) break
        }
        if (!aborted) {
          send({ type: 'done', code: 0 })
          try { controller.close() } catch { /* closed */ }
        }
      })()
    },
    cancel() { killFn?.() },
  })

  req.signal.addEventListener('abort', () => killFn?.())

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
