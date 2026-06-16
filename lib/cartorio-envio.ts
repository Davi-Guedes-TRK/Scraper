import sql from '@/lib/db'
import { portalTable, portalKeys } from '@/lib/portals'
import { oficioFor } from '@/lib/oficios'
import { formatEndereco, refTag } from '@/lib/cartorio'
import { log } from '@/lib/logger'
import { notifyGChat, cartorioMsg } from '@/lib/gchat'

// Envio de solicitação de matrícula ao cartório (2º Ofício, canal e-mail).
// Compartilhado entre a rota manual (/api/cartorio/enviar-email) e o gatilho
// automático (/api/cartorio/auto). 1 e-mail por imóvel, ref no assunto.
//
// O envio real acontece via Google Apps Script (GmailApp.sendEmail) — proxy sem SMTP.
const APPS_SCRIPT_URL    = process.env.APPS_SCRIPT_URL ?? ''
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET ?? ''

type ImovelRow = {
  link: string; portal: string
  endereco: string | null
  endereco_fonte: string | null
  pistas_ia: { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null } | null
  bairro: string | null; titulo: string | null; maps_link: string | null; cidade: string | null
}

export type EnvioResult = { link: string; oficio?: string; ok: boolean; error?: string; skipped?: boolean; simulado?: boolean }
export type EnvioResumo = { ok: boolean; auto: boolean; dryRun: boolean; totalEnviado: number; simulados: number; pulados: number; results: EnvioResult[] }

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

/**
 * Solicita a matrícula (1 e-mail por imóvel) para os links dados.
 * - auto:   aplica o GATE de confiança (só envia endereco_fonte='geoportal').
 * - dryRun: não envia e não grava status — só reporta o que faria (simulado).
 */
export async function solicitarMatriculas(
  links: string[],
  opts: { auto?: boolean; dryRun?: boolean } = {},
): Promise<EnvioResumo> {
  const auto   = opts.auto   ?? false
  const dryRun = opts.dryRun ?? false

  const imoveis = await sql<ImovelRow[]>`
    SELECT link, portal, endereco, endereco_fonte, pistas_ia, bairro, titulo, maps_link, cidade
    FROM imoveis_todos WHERE link = ANY(${links})
  `

  const results: EnvioResult[] = []

  for (const it of imoveis) {
    // GATE: no modo automático só sai endereço grau-cartório (Geoportal IDE-DF).
    if (auto && it.endereco_fonte !== 'geoportal') {
      results.push({ link: it.link, ok: false, skipped: true, error: `confiança baixa (${it.endereco_fonte ?? 'sem fonte'}) — conferir pin` })
      continue
    }
    const of = oficioFor(it.cidade) ?? oficioFor(it.bairro)
    if (!of || of.canal !== 'email') {
      results.push({ link: it.link, ok: false, error: 'sem ofício de e-mail para a região' })
      continue
    }
    if (!portalKeys.includes(it.portal)) {
      results.push({ link: it.link, ok: false, error: `portal desconhecido: ${it.portal}` })
      continue
    }

    if (dryRun) {
      results.push({ link: it.link, oficio: of.nome, ok: false, simulado: true })
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
  const simulados    = results.filter(r => r.simulado).length
  const pulados      = results.filter(r => r.skipped).length

  if (!dryRun && totalEnviado > 0) {
    const oficio = results.find(r => r.ok)?.oficio ?? '2º Ofício'
    await notifyGChat(cartorioMsg.emailEnviado(totalEnviado, oficio)).catch(() => {})
  }

  await log('info', 'cartorio-email', dryRun ? 'Simulação de envio' : (totalEnviado ? 'E-mails enviados (1 por imóvel)' : 'Nenhum enviado'), {
    pedidos: links.length, auto, dryRun, totalEnviado, simulados, pulados,
  }).catch(() => {})

  return { ok: totalEnviado > 0, auto, dryRun, totalEnviado, simulados, pulados, results }
}
