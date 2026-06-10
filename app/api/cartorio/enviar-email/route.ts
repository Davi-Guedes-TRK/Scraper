import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { oficioFor } from '@/lib/oficios'
import { formatEndereco, refTag } from '@/lib/cartorio'
import { log } from '@/lib/logger'

// O envio real acontece via Google Apps Script (GmailApp.sendEmail).
// O Next.js chama o Apps Script Web App como proxy — sem SMTP, sem DNS.
const APPS_SCRIPT_URL    = process.env.APPS_SCRIPT_URL ?? ''
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET ?? ''

type ImovelRow = {
  link: string; portal: string
  endereco: string | null
  pistas_ia: { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null } | null
  bairro: string | null; titulo: string | null; maps_link: string | null; cidade: string | null
}

// 1 e-mail por imóvel. A ref no ASSUNTO é a chave de correlação na volta
// (o cartório responde "Re: ... [#REF]" → o inbound casa pela ref, sem fuzzy).
function buildBody(it: ImovelRow): string {
  const maps = it.maps_link ? `\n${it.maps_link}` : ''
  return `Olá! Sou da TRK Imóveis. Gostaria de solicitar o número da matrícula do seguinte imóvel:

${formatEndereco(it)}${maps}

Por favor, responda informando apenas o número da matrícula.

Ref.: ${refTag(it.link)}
Obrigado!`
}

async function enviarViaAppsScript(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!APPS_SCRIPT_URL) return { ok: false, error: 'APPS_SCRIPT_URL não configurada' }
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: APPS_SCRIPT_SECRET, to, subject, body }),
      redirect: 'follow',
    })
    const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function POST(req: NextRequest) {
  let body: { links?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { links } = body
  if (!Array.isArray(links) || !links.length) {
    return NextResponse.json({ error: 'links[] obrigatório' }, { status: 400 })
  }

  let imoveis: ImovelRow[]
  try {
    imoveis = await sql<ImovelRow[]>`
      SELECT link, portal, endereco, pistas_ia, bairro, titulo, maps_link, cidade
      FROM imoveis_todos WHERE link = ANY(${links})
    `
  } catch (err) {
    return NextResponse.json({ error: `Erro DB: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }
  if (!imoveis.length) return NextResponse.json({ error: 'Nenhum imóvel encontrado' }, { status: 404 })

  // 1 e-mail por imóvel, roteado pelo ofício de canal e-mail (2º Ofício).
  const results: Array<{ link: string; oficio?: string; ok: boolean; error?: string }> = []

  for (const it of imoveis) {
    const of = oficioFor(it.cidade) ?? oficioFor(it.bairro)
    if (!of || of.canal !== 'email') {
      results.push({ link: it.link, ok: false, error: 'sem ofício de e-mail para a região' })
      continue
    }
    if (!portalKeys.includes(it.portal)) {
      results.push({ link: it.link, ok: false, error: `portal desconhecido: ${it.portal}` })
      continue
    }

    const subject = `Solicitação de matrícula — TRK Imóveis ${refTag(it.link)}`
    const { ok, error } = await enviarViaAppsScript(of.contato, subject, buildBody(it))

    if (ok) {
      try {
        await sql.unsafe(
          `UPDATE public."${portalTable(it.portal)}"
              SET status_solicitacao='enviado', status_solicitacao_em=NOW()
            WHERE link=$1`,
          [it.link],
        )
        results.push({ link: it.link, oficio: of.nome, ok: true })
      } catch (err) {
        results.push({ link: it.link, oficio: of.nome, ok: false, error: `enviado mas falha ao gravar status: ${err instanceof Error ? err.message : err}` })
      }
    } else {
      results.push({ link: it.link, oficio: of.nome, ok: false, error })
    }
  }

  const totalEnviado = results.filter(r => r.ok).length
  await log('info', 'cartorio-email', totalEnviado ? 'E-mails enviados (1 por imóvel)' : 'Falha ao enviar', {
    pedidos: links.length, totalEnviado, falhas: results.length - totalEnviado,
  }).catch(() => {})

  return NextResponse.json({ ok: totalEnviado > 0, totalEnviado, results })
}
