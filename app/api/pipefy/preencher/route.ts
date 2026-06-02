import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'

// child_process exige runtime Node (não Edge); side-effect -> nunca cacheia.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Roda o preenchedor Playwright (scripts/pipefy_portal_fill.py --from-db) e devolve o log.
// Funciona só ONDE existe Python + Playwright + credentials/pipefy_session.json (on-prem),
// nunca no Vercel (sem browser/sessão).
export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, error: 'Indisponível no Vercel — rode o app na máquina que tem a sessão do Pipefy (on-prem).' },
      { status: 501 },
    )
  }

  let body: { mode?: string } = {}
  try { body = await req.json() } catch { /* sem body = preview */ }
  const submit = body.mode === 'submit'

  const py = process.env.PYTHON_BIN || 'python'
  const args = ['scripts/pipefy_portal_fill.py', '--from-db', ...(submit ? ['--submit'] : [])]

  return await new Promise<Response>((resolve) => {
    let out = ''
    let child
    try {
      child = spawn(py, args, { cwd: process.cwd(), env: process.env })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      resolve(NextResponse.json({ ok: false, error: `Falha ao iniciar ${py}: ${msg}`, log: out }, { status: 500 }))
      return
    }
    child.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8') })
    child.stderr.on('data', (d: Buffer) => { out += d.toString('utf-8') })
    child.on('error', (err: Error) => {
      resolve(NextResponse.json(
        { ok: false, error: `Não consegui rodar "${py}". Está no PATH? (${err.message})`, log: out },
        { status: 500 },
      ))
    })
    child.on('close', (code: number | null) => {
      resolve(NextResponse.json(
        { ok: code === 0, code, mode: submit ? 'submit' : 'preview', log: out || '(sem saída)' },
        { status: code === 0 ? 200 : 500 },
      ))
    })
  })
}
