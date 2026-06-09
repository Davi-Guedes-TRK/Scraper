import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { oficioFor } from '@/lib/oficios'
import { formatEndereco } from '@/lib/cartorio'
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

function buildBody(imoveis: ImovelRow[], nomeOficio: string): string {
  const lista = imoveis.map((it, i) => {
    const maps = it.maps_link ? `\n   ${it.maps_link}` : ''
    return `${i + 1}. ${formatEndereco(it)}${maps}`
  }).join('\n\n')
  return `Prezados, ${nomeOficio},

Meu nome é Davi Guedes, da TRK Imóveis. Gostaria de solicitar o número da matrícula e a certidão de ônus reais dos imóveis listados abaixo:

${lista}

Por favor, responda diretamente a este e-mail informando o número da matrícula de cada imóvel no seguinte formato:

  Endereço — [número da matrícula]

Exemplo:
  SQN 312 Bloco B Apto 204 — 123456

Desde já, muito obrigado!

Atenciosamente,
Davi Guedes — TRK Imóveis
d.guedes@trkimoveis.com.br`
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

  const groups = new Map<string, { email: string; nome: string; rows: ImovelRow[] }>()
  for (const it of imoveis) {
    const of = oficioFor(it.cidade) ?? oficioFor(it.bairro)
    if (!of || of.canal !== 'email') continue
    if (!groups.has(of.contato)) groups.set(of.contato, { email: of.contato, nome: of.nome, rows: [] })
    groups.get(of.contato)!.rows.push(it)
  }
  if (!groups.size) {
    return NextResponse.json({ error: 'Nenhum imóvel pertence a ofício com canal e-mail' }, { status: 422 })
  }

  const results: Array<{ oficio: string; enviado: number; error?: string }> = []

  for (const { email, nome, rows } of groups.values()) {
    const n = rows.length
    const subject = `Solicitação de matrícula e certidão de ônus — TRK Imóveis (${n} imóvel${n > 1 ? 'is' : ''})`
    const { ok, error } = await enviarViaAppsScript(email, subject, buildBody(rows, nome))

    if (ok) {
      const byPortal: Record<string, string[]> = {}
      for (const it of rows) {
        if (portalKeys.includes(it.portal)) (byPortal[it.portal] ??= []).push(it.link)
      }
      await Promise.all(
        Object.entries(byPortal).map(([p, ls]) =>
          sql.unsafe(`UPDATE public."${portalTable(p)}" SET status_solicitacao='enviado' WHERE link = ANY($1)`, [ls])
        )
      )
      results.push({ oficio: nome, enviado: n })
    } else {
      results.push({ oficio: nome, enviado: 0, error })
    }
  }

  const totalEnviado = results.reduce((s, r) => s + r.enviado, 0)
  await log('info', 'cartorio-email', totalEnviado ? 'E-mails enviados' : 'Falha ao enviar', {
    links: links.length, totalEnviado, results,
  }).catch(() => {})

  return NextResponse.json({ ok: totalEnviado > 0, results, totalEnviado })
}
