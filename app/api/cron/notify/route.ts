import { NextRequest, NextResponse } from 'next/server'
import { notifyGChat } from '@/lib/gchat'

export const runtime = 'nodejs'

// Chamado pelo step final dos GH Actions workflows.
// Auth: header x-api-key === SCRAPER_API_KEY (já existente no Vercel).
export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  if (!process.env.SCRAPER_API_KEY || key !== process.env.SCRAPER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { workflow?: string; status?: string; duration_s?: number; error?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { workflow = '?', status = '?', duration_s, error } = body
  const dur = duration_s ? ` · ${Math.round(duration_s)}s` : ''

  let msg: string
  if (status === 'dispatched') {
    msg = `🔁 *${workflow}* disparado`
  } else if (status === 'success') {
    msg = `✅ *${workflow}* concluído${dur}`
  } else {
    msg = `❌ *${workflow}* FALHOU${dur}${error ? `\n\`${error.slice(0, 300)}\`` : ''}`
  }

  await notifyGChat(msg).catch(() => {})
  return NextResponse.json({ ok: true })
}
