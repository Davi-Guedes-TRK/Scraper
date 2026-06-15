// Backfill QUIETO do gate de dedup nas matrículas já recebidas que nunca passaram
// pelo gate (foram recebidas antes da Fase 3). Popula onus_pipeline com o resultado
// do dedup. NÃO notifica GChat nem mexe em cards — isso é só pro fluxo ao vivo.
// Uso: node scripts/_backfill_onus_gate.mjs [--commit]   (sem --commit = dry, só mostra)
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { enderecoNorm, chaveEndereco } from '../lib/endereco-normalizar.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })
const COMMIT = process.argv.includes('--commit')

// Matrículas cuja ônus JÁ foi submetida historicamente (era hardcoded em
// pipefy_portal_fill.py ONUS_SUBMETIDOS). No backfill marcamos onus_solicitada_em
// pra elas NÃO reentrarem na fila e gerar pedido duplicado (= gasto).
const ONUS_JA_SUBMETIDA = new Set(
  ['25063','51051','36521','80888','4587','4694','94385','24996','89307','104923','31071','35641'])
const semZeros = m => String(m ?? '').replace(/\D/g, '').replace(/^0+/, '')

// formatEndereco (réplica de lib/cartorio.ts — evita o import extensionless de ./db)
function formatEndereco(im) {
  if (im.endereco) return im.endereco
  const p = im.pistas_ia
  if (p) {
    const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  return im.bairro || im.titulo || '—'
}

// buscarImovelNoDw (réplica de lib/dw-dedup.ts — mesma lógica de níveis)
async function buscarImovelNoDw(endereco) {
  const c = chaveEndereco(endereco)
  const norm = enderecoNorm(endereco)
  if (c.chave) {
    const rows = await sql`
      SELECT codigo_imovel, setor FROM dw_imoveis WHERE endereco_chave = ${c.chave}`
    const ok = rows.filter(r =>
      !r.setor || !c.setor || r.setor.startsWith(c.setor) || c.setor.startsWith(r.setor))
    if (ok.length) return { nivel: 'exato', matches: ok }
  }
  if (norm.length >= 8) {
    const rows = await sql`
      SELECT codigo_imovel, similarity(endereco_norm, ${norm})::float AS sim
      FROM dw_imoveis
      WHERE endereco_norm % ${norm} AND similarity(endereco_norm, ${norm}) > 0.5
        AND ${c.chave ? sql`endereco_chave IS NULL` : sql`true`}
      ORDER BY sim DESC LIMIT 5`
    if (rows.length) return { nivel: 'provavel', matches: rows }
  }
  return { nivel: 'nenhum', matches: [] }
}

// Imóveis com matrícula recebida, ainda não no onus_pipeline.
const imoveis = await sql`
  SELECT link, portal, titulo, bairro, cidade, endereco, pistas_ia, numero_matricula
  FROM imoveis_todos
  WHERE numero_matricula IS NOT NULL AND btrim(numero_matricula) NOT IN ('', 'N/A')
    AND portal <> 'chavesnamao'
    AND link NOT IN (SELECT link FROM onus_pipeline)`
console.log(`${imoveis.length} imóvel(is) com matrícula fora do pipeline\n`)

const tally = { exato: 0, provavel: 0, nenhum: 0 }
for (const im of imoveis) {
  const endereco = formatEndereco(im)
  const dedup = await buscarImovelNoDw(endereco)
  const codigos = dedup.matches.map(m => m.codigo_imovel)
  tally[dedup.nivel]++
  const jaSubmetida = ONUS_JA_SUBMETIDA.has(semZeros(im.numero_matricula))
  const tag = dedup.nivel === 'exato' ? '🔁 JÁ NA BASE' : dedup.nivel === 'provavel' ? '🤔 CONFERIR' : '🟢 LIBERADO'
  const marca = jaSubmetida ? '  [ônus já submetida — fora da fila]' : ''
  console.log(`${tag}  matr ${im.numero_matricula}  ${endereco}${codigos.length ? '  → ' + codigos.join(',') : ''}${marca}`)

  if (COMMIT) {
    await sql`
      INSERT INTO onus_pipeline ${sql({
        link: im.link, portal: im.portal, matricula: String(im.numero_matricula),
        endereco, bairro: im.bairro ?? null, cidade: im.cidade ?? null,
        dedup_nivel: dedup.nivel, dedup_codigos: codigos, dedup_em: new Date(),
        onus_solicitada_em: jaSubmetida ? new Date() : null,
      })}
      ON CONFLICT (link) DO NOTHING`
  }
}

console.log(`\nresumo: exato=${tally.exato} provavel=${tally.provavel} nenhum=${tally.nenhum}`)
console.log(COMMIT ? '✓ gravado no onus_pipeline' : '(dry — rode com --commit pra gravar)')
await sql.end()
