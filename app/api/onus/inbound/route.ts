import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { extrairDadosOnus } from '@/lib/onus-extract'
import { buscarPessoaNoDw } from '@/lib/dw-dedup'
import { lookupCPF } from '@/lib/cpf-lookup'
import { atualizarCardOportunidade } from '@/lib/pipefy'
import { notifyGChat, cartorioMsg } from '@/lib/gchat'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

// Inbound da CERTIDÃO DE ÔNUS (PDF) — POSTado pelo Apps Script quando chega e-mail
// do cartório com anexo PDF. Fluxo:
//   PDF → Gemini extrai proprietário+CPF → correlaciona pela MATRÍCULA (onus_pipeline)
//   → contato: dw_pessoas (nome) > busca-CPF (Telegram) > aviso manual
//   → atualiza card COM-Oportunidades + onus_pipeline + GChat.
//
// Body: { from?, subject?, filename?, pdf_base64 }
// Auth: ?token=<INBOUND_WEBHOOK_SECRET> (mesmo secret do /api/cartorio/inbound)

type Payload = { from?: string; subject?: string; filename?: string; pdf_base64?: string }

const semZeros = (m: string | null | undefined) => (m ?? '').replace(/\D/g, '').replace(/^0+/, '')

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (secret && req.nextUrl.searchParams.get('token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Payload
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const subject = (payload.subject ?? '').slice(0, 200)
  if (!payload.pdf_base64) {
    return NextResponse.json({ error: 'pdf_base64 obrigatório' }, { status: 400 })
  }

  // 1. Extração (Gemini lê o PDF direto — digital ou escaneado)
  const dados = await extrairDadosOnus(payload.pdf_base64)
  const matricula = semZeros(dados.matricula) || semZeros(subject.match(/\d{4,9}/)?.[0])
  const titular = dados.proprietarios[0] ?? null

  // 2. Correlação pela matrícula
  const pendentes = matricula
    ? await sql<{ link: string; card_id: string | null; endereco: string | null }[]>`
        SELECT link, card_id, endereco FROM onus_pipeline
        WHERE regexp_replace(coalesce(matricula, ''), '\\D', '', 'g') = ${matricula}
        ORDER BY atualizado_em DESC LIMIT 1`
    : []
  const alvo = pendentes[0] ?? null

  if (!alvo || !titular) {
    await notifyGChat(cartorioMsg.onusSemCorrelacao(subject, matricula || null)).catch(() => {})
    await log('warn', 'onus-inbound', 'Ônus sem correlação ou sem proprietário', {
      subject, matricula, proprietarios: dados.proprietarios.length, confianca: dados.confianca,
    }).catch(() => {})
    return NextResponse.json({ ok: false, matricula, extraido: dados, correlacionado: false })
  }

  // 3. Contato: espelho do dw_trk (por nome — Nido não tem CPF) > busca-CPF > manual
  let telefones: string[] = []
  let emails: string[] = []
  let fonte: 'dw' | 'busca-pessoa' | 'manual' = 'manual'

  const noDw = await buscarPessoaNoDw(titular.nome).catch(() => null)
  const matchDw = noDw?.matches.find(m => m.telefones.length || m.emails.length)
  if (matchDw) {
    telefones = matchDw.telefones
    emails = matchDw.emails
    fonte = 'dw'
  } else if (titular.cpf && titular.cpf.length === 11) {
    try {
      const r = await lookupCPF(titular.cpf)
      telefones = r.telefones.map(t => t.numero).filter(Boolean)
      emails = r.emails
      fonte = 'busca-pessoa'
    } catch (err) {
      await log('warn', 'onus-inbound', 'busca-CPF falhou', {
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {})
    }
  }

  // 4. Persiste no pipeline
  await sql`
    UPDATE onus_pipeline SET
      onus_recebida_em = now(),
      proprietario = ${titular.nome},
      cpf = ${titular.cpf ?? null},
      proprietario_fonte = ${fonte},
      telefones = ${telefones},
      emails = ${emails},
      atualizado_em = now()
    WHERE link = ${alvo.link}`

  // 5. Espelha no card (best-effort)
  if (alvo.card_id) {
    const valores: Array<{ fieldId: string; value: string }> = [
      { fieldId: 'nome_do_propriet_rio_1', value: titular.nome },
    ]
    if (telefones[0]) valores.push({ fieldId: 'telefone_contato_1', value: telefones[0] })
    if (emails[0])    valores.push({ fieldId: 'e_mail', value: emails[0] })
    const extras = [
      telefones.length > 1 ? `Outros tel: ${telefones.slice(1).join(', ')}` : '',
      dados.resumo_onus ? `Ônus: ${dados.resumo_onus}` : '',
      dados.proprietarios.length > 1
        ? `Co-proprietários: ${dados.proprietarios.slice(1).map(p => p.nome).join('; ')}` : '',
    ].filter(Boolean).join('\n')
    if (extras) valores.push({ fieldId: 'outros_contatos', value: extras })

    await atualizarCardOportunidade(alvo.card_id, valores).catch(err =>
      log('warn', 'onus-inbound', 'falha ao atualizar card', {
        cardId: alvo.card_id, error: err instanceof Error ? err.message : String(err),
      }).catch(() => {}))
  }

  // 6. Avisos
  if (fonte === 'manual') {
    await notifyGChat(cartorioMsg.onusSemContato(matricula, titular.nome)).catch(() => {})
  } else {
    await notifyGChat(cartorioMsg.onusRecebida(matricula, titular.nome, titular.cpf ?? null, fonte)).catch(() => {})
  }

  await log('info', 'onus-inbound', 'Ônus processada', {
    matricula, link: alvo.link, fonte, telefones: telefones.length,
    confianca: dados.confianca, tem_onus: dados.tem_onus,
  }).catch(() => {})

  return NextResponse.json({
    ok: true, matricula, link: alvo.link, proprietario: titular.nome,
    fonte, telefones: telefones.length, emails: emails.length,
  })
}
