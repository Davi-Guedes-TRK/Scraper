import { NextRequest, NextResponse } from 'next/server'
import { notifyGChat } from '@/lib/gchat'

export const runtime = 'nodejs'
export const maxDuration = 30

// Mapa: nome do workflow → label legível para o GChat
const WORKFLOWS: Record<string, { label: string; brt: string }> = {
  'olx-sync':             { label: 'OLX',               brt: '07:00' },
  'dfimoveis-sync':       { label: 'DFImóveis',          brt: '08:00' },
  'chaves-sync':          { label: 'Chaves na Mão',      brt: '08:00' },
  'lotus-sync':           { label: 'Lotus Cidade',       brt: '06:00' },
  'vivareal-sync':        { label: 'Viva Real',          brt: '09:00' },
  'wimoveis-sync':        { label: 'Wimoveis',           brt: '09:00' },
  'zap-sync':             { label: 'ZAP Imóveis',        brt: '10:00' },
  'lancamentos-sync':     { label: 'Lançamentos DF',     brt: '07:00' },
  'pipefy-sync':          { label: 'Pipefy',             brt: 'multi' },
  'pipefy-token-refresh': { label: 'Pipefy Token',       brt: '06:00' },
  'validar-links':        { label: 'Validar Links',      brt: '02:00' },
  'auto-cartorio-2oficio':{ label: 'Auto 2º Ofício',     brt: '14:00' },
}

const REPO = 'Davi-Guedes-TRK/Scraper'

export async function POST(req: NextRequest) {
  // Auth: Vercel injeta Authorization: Bearer <CRON_SECRET> nos cron requests
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const workflow = searchParams.get('w')
  if (!workflow || !(workflow in WORKFLOWS)) {
    return NextResponse.json(
      { error: `Workflow inválido: ${workflow}. Válidos: ${Object.keys(WORKFLOWS).join(', ')}` },
      { status: 400 },
    )
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_DISPATCH_TOKEN não configurado' }, { status: 500 })
  }

  const meta = WORKFLOWS[workflow]
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}.yml/dispatches`

  let ghStatus = 0
  let ghBody = ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    })
    ghStatus = res.status
    ghBody = await res.text().catch(() => '')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await notifyGChat(`❌ *Cron ${meta.label}* — falha ao contactar GitHub: \`${msg}\``).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (ghStatus === 204) {
    await notifyGChat(
      `🔁 *${meta.label}* disparado (${meta.brt} BRT · Vercel Cron)`,
    ).catch(() => {})
    return NextResponse.json({ ok: true, workflow })
  }

  // GH retornou erro (ex: 401 token expirado, 404 workflow não encontrado)
  await notifyGChat(
    `❌ *Cron ${meta.label}* — GH retornou ${ghStatus}\n\`${ghBody.slice(0, 200)}\``,
  ).catch(() => {})
  return NextResponse.json({ error: `GitHub ${ghStatus}`, body: ghBody }, { status: 502 })
}
