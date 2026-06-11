import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { matchCartorioReply, formatEndereco, refForLink, parseRefFromSubject, parseMatriculaFromText } from '@/lib/cartorio'
import { criarCardOportunidade, type ImovelParaCard } from '@/lib/pipefy'
import { log } from '@/lib/logger'
import { notifyGChat, cartorioMsg } from '@/lib/gchat'

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

/** Retorna true se já existe card no Pipefy para esse link de anúncio. */
async function cardJaExiste(link: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM public.pipefy_captacoes
    WHERE links_anuncio ILIKE ${'%' + link + '%'}
    LIMIT 1
  `
  return (rows[0]?.n ?? 0) > 0
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

  // Correlação: com 1 e-mail por imóvel, a ref no assunto ("Re: ... [#REF]")
  // identifica o imóvel de forma determinística. Fallback fuzzy por endereço
  // cobre e-mails antigos (lista numerada) ou assuntos sem ref.
  type Casado = { matricula: string; address: string; candidate: typeof candidates[number] }
  const ref          = parseRefFromSubject(subject)
  const refCandidate = ref ? (candidates.find(c => refForLink(c.link) === ref) ?? null) : null
  const refMatricula = parseMatriculaFromText(text)

  let casados: Casado[]
  let metodo: 'ref' | 'fuzzy'
  let entradas: number

  if (refCandidate && refMatricula) {
    metodo   = 'ref'
    entradas = 1
    casados  = [{ matricula: refMatricula, address: refCandidate.endereco, candidate: refCandidate }]
  } else {
    metodo        = 'fuzzy'
    const matches = matchCartorioReply(text, candidates)
    entradas      = matches.length
    casados       = matches.filter(m => m.candidate !== null).map(m => ({
      matricula: m.matricula, address: m.address, candidate: m.candidate!,
    }))
  }

  // 1. Salva matrículas + notifica GChat
  await salvarMatriculas(casados.map(m => ({
    link:      m.candidate!.link,
    portal:    m.candidate!.portal,
    matricula: m.matricula,
  })))
  await Promise.all(casados.map(m =>
    notifyGChat(cartorioMsg.matriculaRecebida(m.candidate!.endereco, m.matricula, metodo))
  )).catch(() => {})

  // 2. Cria card no Pipefy "COM - Oportunidades" — pula se já existir
  const cards: Array<{ link: string; cardId: string; cardUrl: string; error?: string; skipped?: boolean }> = []
  for (const m of casados) {
    const imovel = aguardando.find(it => it.link === m.candidate!.link)
    if (!imovel) continue
    try {
      const jaExiste = await cardJaExiste(imovel.link)
      if (jaExiste) {
        cards.push({ link: imovel.link, cardId: '', cardUrl: '', skipped: true })
        await notifyGChat(cartorioMsg.cardExistente(formatEndereco(imovel))).catch(() => {})
        continue
      }
      const card = await criarCardOportunidade({ ...imovel, numero_matricula: m.matricula })
      cards.push({ link: imovel.link, cardId: card.id, cardUrl: card.url })
      await notifyGChat(cartorioMsg.cardCriado(formatEndereco(imovel), m.matricula, card.url)).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      cards.push({ link: imovel.link, cardId: '', cardUrl: '', error: msg })
      await notifyGChat(cartorioMsg.erroCard(formatEndereco(imovel), msg)).catch(() => {})
      await log('error', 'cartorio-inbound', 'Falha ao criar card Pipefy', { link: imovel.link, error: msg }).catch(() => {})
    }
  }

  const cardsCriados = cards.filter(c => !c.error && !c.skipped).length
  const cardsPulados = cards.filter(c => c.skipped).length

  await log('info', 'cartorio-inbound', 'Resposta do cartório processada', {
    from, subject, metodo,
    entradas,
    casadas:     casados.length,
    semMatch:    entradas - casados.length,
    cardsCriados,
    cardsPulados,
    cardsComErro: cards.filter(c => c.error).length,
  }).catch(() => {})

  return NextResponse.json({
    ok:          casados.length > 0,
    metodo,
    matched:     casados.length,
    unmatched:   entradas - casados.length,
    cardsCriados,
    cardsPulados,
    details: casados.map(m => ({
      matricula: m.matricula,
      link:      m.candidate!.link,
      card:      cards.find(c => c.link === m.candidate!.link),
    })),
  })
}
