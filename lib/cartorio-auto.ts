import sql from '@/lib/db'
import { portalTable } from '@/lib/portals'
import { oficioFor } from '@/lib/oficios'
import { acharCandidatos } from '@/lib/geoportal-candidates'
import { solicitarMatriculas, type EnvioResult } from '@/lib/cartorio-envio'
import { log } from '@/lib/logger'

// Gatilho que liga a PoC do Geoportal ao gate de envio:
//   1. pega aprovados do 2º Ofício ainda sem solicitação/matrícula
//   2. nos que não têm endereço grau-cartório, roda a PoC; confiança ALTA →
//      grava o endereço oficial + endereco_fonte='geoportal'
//   3. envia (gate auto) só os que ficaram 'geoportal'
// dryRun: resolve e reporta, mas não grava nem envia.

type Pendente = {
  link: string; portal: string
  endereco: string | null
  endereco_fonte: string | null
  pistas_ia: { quadra?: string | null; conjunto?: string | null; casa_lote?: string | null } | null
  bairro: string | null; cidade: string | null
  area_m2: string | null
  lat: number | null; lng: number | null
}

function parseArea(area: string | null): number | undefined {
  if (!area) return undefined
  const m = area.replace(',', '.').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : undefined
}

export type AutoResumo = {
  dryRun: boolean
  candidatos2oficio: number
  jaGeoportal: number
  resolvidosPorGeoportal: number
  semConfianca: number
  enviados: number
  simulados: number
  pulados: number
  detalhe: {
    resolvidos: Array<{ link: string; endereco: string; score: number }>
    semConfianca: Array<{ link: string; confianca: string; melhor: string | null }>
    envio: EnvioResult[]
  }
}

export async function rodarAuto2Oficio(opts: { limite?: number; dryRun?: boolean } = {}): Promise<AutoResumo> {
  const limite = opts.limite ?? 20
  const dryRun = opts.dryRun ?? false

  // 1) aprovados, sem solicitação enviada e sem matrícula
  const pend = await sql<Pendente[]>`
    SELECT link, portal, endereco, endereco_fonte, pistas_ia, bairro, cidade, area_m2, lat, lng
    FROM imoveis_todos
    WHERE status_triagem = 'aprovado'
      AND (status_solicitacao IS NULL OR status_solicitacao = 'pendente')
      AND (numero_matricula IS NULL OR numero_matricula = '')
    LIMIT 500
  `

  // só 2º Ofício (canal e-mail) pela região
  const do2o = pend.filter(p => {
    const of = oficioFor(p.cidade) ?? oficioFor(p.bairro)
    return of?.canal === 'email'
  })

  const jaGeoportal = do2o.filter(p => p.endereco_fonte === 'geoportal').length
  const resolvidos: AutoResumo['detalhe']['resolvidos'] = []
  const semConfianca: AutoResumo['detalhe']['semConfianca'] = []

  // 2) PoC nos que ainda não são grau-cartório (limitado por rodada)
  let processados = 0
  for (const p of do2o) {
    if (p.endereco_fonte === 'geoportal') continue
    if (processados >= limite) break
    processados++

    const r = await acharCandidatos({
      lat: p.lat ?? undefined,
      lng: p.lng ?? undefined,
      quadra:   p.pistas_ia?.quadra ?? undefined,
      conjunto: p.pistas_ia?.conjunto ?? undefined,
      endereco: p.endereco,
      area_m2:  parseArea(p.area_m2),
    }).catch(() => null)

    if (r && r.confianca === 'alta' && r.melhor?.endereco) {
      if (!dryRun) {
        await sql.unsafe(
          `UPDATE public."${portalTable(p.portal)}" SET endereco=$1, endereco_fonte='geoportal' WHERE link=$2`,
          [r.melhor.endereco, p.link],
        )
      }
      resolvidos.push({ link: p.link, endereco: r.melhor.endereco, score: +r.melhor.score.toFixed(2) })
    } else {
      semConfianca.push({ link: p.link, confianca: r?.confianca ?? 'erro', melhor: r?.melhor?.endereco ?? null })
    }
  }

  // 3) envia (gate auto) os que são/ficaram 'geoportal'
  const resolvidosSet = new Set(resolvidos.map(r => r.link))
  const linksParaEnviar = do2o
    .filter(p => p.endereco_fonte === 'geoportal' || resolvidosSet.has(p.link))
    .map(p => p.link)

  const envio = linksParaEnviar.length
    ? await solicitarMatriculas(linksParaEnviar, { auto: true, dryRun })
    : { totalEnviado: 0, simulados: 0, pulados: 0, results: [] as EnvioResult[] }

  const resumo: AutoResumo = {
    dryRun,
    candidatos2oficio: do2o.length,
    jaGeoportal,
    resolvidosPorGeoportal: resolvidos.length,
    semConfianca: semConfianca.length,
    enviados: envio.totalEnviado,
    simulados: envio.simulados,
    pulados: envio.pulados,
    detalhe: { resolvidos, semConfianca, envio: envio.results },
  }

  await log('info', 'cartorio-auto', 'Rodada auto 2º ofício', {
    dryRun, candidatos: do2o.length, jaGeoportal,
    resolvidos: resolvidos.length, semConfianca: semConfianca.length,
    enviados: envio.totalEnviado, simulados: envio.simulados,
  }).catch(() => {})

  return resumo
}
