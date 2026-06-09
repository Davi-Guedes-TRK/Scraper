import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { matchCartorioReply, formatEndereco } from '@/lib/cartorio'
import { log } from '@/lib/logger'

// Webhook de inbound de e-mail (Resend Inbound, Cloudflare Email Worker, etc.)
// Recebe a resposta do cartório, casa endereço→matrícula e grava automaticamente.
//
// Resend Inbound envia um POST com Content-Type: application/json:
//   { from, to, subject, text, html, ... }
// Cloudflare Email Workers envia o raw MIME — adapte `parsePayload` se necessário.
//
// Configure o endereço `onus@captacao.trkimoveis.com.br` para encaminhar aqui.
// Para autenticar, use INBOUND_WEBHOOK_SECRET (header `x-webhook-secret`).

type InboundPayload = {
  from?: string
  to?: string | string[]
  subject?: string
  text?: string
  html?: string
}

type ImovelAguardando = {
  link: string
  portal: string
  endereco: string | null
  pistas_ia: { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null } | null
  bairro: string | null
  titulo: string | null
}

async function loadAguardando(): Promise<ImovelAguardando[]> {
  return sql<ImovelAguardando[]>`
    SELECT link, portal, endereco, pistas_ia, bairro, titulo
    FROM imoveis_todos
    WHERE (status_triagem = 'aprovado' OR visitado_em IS NOT NULL)
      AND status_triagem IS DISTINCT FROM 'descartado'
      AND (numero_matricula IS NULL OR numero_matricula = '')
      AND status_solicitacao = 'enviado'
    LIMIT 2000
  `
}

async function gravarMatriculas(pares: Array<{ link: string; portal: string; matricula: string }>) {
  for (const { link, portal, matricula } of pares) {
    if (!portalKeys.includes(portal)) continue
    await sql.unsafe(
      `UPDATE public."${portalTable(portal)}"
          SET numero_matricula = $1,
              status_solicitacao = 'recebido'
        WHERE link = $2`,
      [matricula, link],
    )
  }
}

export async function POST(req: NextRequest) {
  // Autenticação simples por secret no header (configure no painel do Resend Inbound).
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (secret) {
    const received = req.headers.get('x-webhook-secret') ?? req.headers.get('svix-signature') ?? ''
    if (!received.includes(secret)) {
      await log('warn', 'cartorio-inbound', 'Assinatura inválida — descartado').catch(() => {})
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: InboundPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const text = payload.text ?? ''
  if (!text.trim()) {
    await log('info', 'cartorio-inbound', 'E-mail sem texto — ignorado', { from: payload.from }).catch(() => {})
    return NextResponse.json({ ok: true, matched: 0, skipped: 'sem texto' })
  }

  const aguardando = await loadAguardando()
  if (!aguardando.length) {
    return NextResponse.json({ ok: true, matched: 0, skipped: 'sem imóveis aguardando' })
  }

  const candidates = aguardando.map(it => ({
    link: it.link,
    portal: it.portal,
    endereco: formatEndereco(it),
  }))

  const matches = matchCartorioReply(text, candidates)
  const confirmados = matches.filter(m => m.candidate !== null)

  if (confirmados.length) {
    await gravarMatriculas(confirmados.map(m => ({
      link: m.candidate!.link,
      portal: m.candidate!.portal,
      matricula: m.matricula,
    })))
  }

  await log('info', 'cartorio-inbound', 'Resposta processada', {
    from: payload.from,
    subject: payload.subject,
    entradas: matches.length,
    casadas: confirmados.length,
    semMatch: matches.length - confirmados.length,
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    matched: confirmados.length,
    unmatched: matches.length - confirmados.length,
    details: confirmados.map(m => ({ matricula: m.matricula, link: m.candidate!.link })),
  })
}
