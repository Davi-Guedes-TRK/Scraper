import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { matchCartorioReply, formatEndereco } from '@/lib/cartorio'
import { criarCardOportunidade, type ImovelParaCard } from '@/lib/pipefy'
import { log } from '@/lib/logger'

// Webhook de inbound Resend.
// Configuração: Resend Dashboard → Inbound → Routing
//   Domain  : captacao.trkimoveis.com.br
//   Address : onus@captacao.trkimoveis.com.br (ou *)
//   Endpoint: https://<app>/api/cartorio/inbound?token=<INBOUND_WEBHOOK_SECRET>
//
// Resend envia POST com Content-Type: application/json:
//   { type: "email.received", data: { from, to, subject, text, html, ... } }

type ResendInboundPayload = {
  type?: string
  data?: {
    from?: string
    to?: string[]
    subject?: string
    text?: string
    html?: string
  }
  // fallback: alguns provedores enviam flat
  from?: string
  subject?: string
  text?: string
}

type ImovelAguardando = ImovelParaCard & {
  link: string
  portal: string
}

async function loadAguardando(): Promise<ImovelAguardando[]> {
  return sql<ImovelAguardando[]>`
    SELECT link, portal, titulo, bairro, cidade, preco, area_m2, tipo_imovel, tipo,
           telefone, nome_anunciante, endereco, pistas_ia, maps_link
    FROM imoveis_todos
    WHERE (status_triagem = 'aprovado' OR visitado_em IS NOT NULL)
      AND status_triagem IS DISTINCT FROM 'descartado'
      AND (numero_matricula IS NULL OR numero_matricula = '')
      AND status_solicitacao = 'enviado'
    LIMIT 2000
  `
}

async function salvarMatriculas(pares: Array<{ link: string; portal: string; matricula: string }>) {
  for (const { link, portal, matricula } of pares) {
    if (!portalKeys.includes(portal)) continue
    await sql.unsafe(
      `UPDATE public."${portalTable(portal)}"
          SET numero_matricula        = $1,
              status_solicitacao      = 'recebido',
              status_solicitacao_em   = NOW()
        WHERE link = $2`,
      [matricula, link],
    )
  }
}

export async function POST(req: NextRequest) {
  // Auth: token no query param (URL configurada no Resend inclui ?token=<secret>)
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (secret) {
    const token = req.nextUrl.searchParams.get('token')
    if (token !== secret) {
      await log('warn', 'cartorio-inbound', 'Token inválido', { ip: req.headers.get('x-forwarded-for') }).catch(() => {})
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: ResendInboundPayload
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Normaliza payload Resend (aninhado em `data`) ou flat
  const emailData = payload.data ?? payload
  const text      = emailData.text ?? ''
  const from      = emailData.from ?? ''
  const subject   = (payload.data?.subject ?? (payload as { subject?: string }).subject ?? '').slice(0, 200)

  if (!text.trim()) {
    return NextResponse.json({ ok: true, matched: 0, skipped: 'sem texto' })
  }

  const aguardando = await loadAguardando()
  if (!aguardando.length) {
    return NextResponse.json({ ok: true, matched: 0, skipped: 'sem imóveis aguardando' })
  }

  const candidates = aguardando.map(it => ({
    link:     it.link,
    portal:   it.portal,
    endereco: formatEndereco(it),
  }))

  const matches   = matchCartorioReply(text, candidates)
  const casados   = matches.filter(m => m.candidate !== null)

  // 1. Salva matrículas
  await salvarMatriculas(casados.map(m => ({
    link:      m.candidate!.link,
    portal:    m.candidate!.portal,
    matricula: m.matricula,
  })))

  // 2. Cria card no Pipefy "COM - Oportunidades" para cada imóvel casado
  const cards: Array<{ link: string; cardId: string; cardUrl: string; error?: string }> = []
  for (const m of casados) {
    const imovel = aguardando.find(it => it.link === m.candidate!.link)
    if (!imovel) continue
    try {
      const card = await criarCardOportunidade({ ...imovel, numero_matricula: m.matricula })
      cards.push({ link: imovel.link, cardId: card.id, cardUrl: card.url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      cards.push({ link: imovel.link, cardId: '', cardUrl: '', error: msg })
      await log('error', 'cartorio-inbound', 'Falha ao criar card Pipefy', { link: imovel.link, error: msg }).catch(() => {})
    }
  }

  const cardsCriados = cards.filter(c => !c.error).length

  await log('info', 'cartorio-inbound', 'Resposta do cartório processada', {
    from, subject,
    entradas:    matches.length,
    casadas:     casados.length,
    semMatch:    matches.length - casados.length,
    cardsCriados,
    cardsComErro: cards.filter(c => c.error).length,
  }).catch(() => {})

  return NextResponse.json({
    ok:          casados.length > 0,
    matched:     casados.length,
    unmatched:   matches.length - casados.length,
    cardsCriados,
    details: casados.map(m => ({
      matricula: m.matricula,
      link:      m.candidate!.link,
      card:      cards.find(c => c.link === m.candidate!.link),
    })),
  })
}
