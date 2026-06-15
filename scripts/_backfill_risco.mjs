// Backfill do risco geológico nas linhas existentes do onus_pipeline.
// Usa lat/lng do imoveis_todos + camadas de suscetibilidade do SGB (wfs-sgb.ts,
// self-contained). Replica a lógica de lib/ficha-risco.ts sem o cache Redis.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { sgbNoPonto } from '../lib/wfs-sgb.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })
const COMMIT = process.argv.includes('--commit')

const CAMADAS = [
  ['gestao-territorial:suscet_movimento_de_massa', 'Movimento de massa'],
  ['gestao-territorial:suscet_inundacao', 'Inundação'],
  ['gestao-territorial:suscet_enxurrada', 'Enxurrada'],
  ['gestao-territorial:suscet_corrida_de_massa', 'Corrida de massa'],
]
const PESO = { Baixa: 1, Média: 2, Alta: 3 }
const normGrau = c => {
  const s = (c ?? '').trim().toLowerCase()
  if (s.startsWith('alt')) return 'Alta'
  if (s.startsWith('méd') || s.startsWith('med')) return 'Média'
  if (s.startsWith('baix')) return 'Baixa'
  return null
}

const linhas = await sql`
  SELECT op.link, i.lat, i.lng
  FROM onus_pipeline op
  JOIN imoveis_todos i ON i.link = op.link
  WHERE op.risco_nivel IS NULL AND i.lat IS NOT NULL AND i.lng IS NOT NULL`
console.log(`${linhas.length} linha(s) com lat/lng p/ avaliar\n`)

for (const { link, lat, lng } of linhas) {
  const riscos = []
  for (const [tn, rot] of CAMADAS) {
    try {
      const feats = await sgbNoPonto(tn, lat, lng, ['classe'])
      let pior = null
      for (const f of feats) { const g = normGrau(f.classe); if (g && (!pior || PESO[g] > PESO[pior])) pior = g }
      if (pior) riscos.push(`${rot}: ${pior}`)
    } catch { /* ignora */ }
  }
  const piorGeral = riscos.reduce((m, r) => Math.max(m, PESO[r.split(': ')[1]] ?? 0), 0)
  const nivel = piorGeral === 3 ? 'alto' : piorGeral === 2 ? 'medio' : piorGeral === 1 ? 'baixo' : 'nenhum'
  const resumo = riscos.join(' · ') || null
  console.log(`${nivel.padEnd(6)} ${resumo ?? '(sem risco mapeado)'}  ${link.slice(0, 55)}`)
  if (COMMIT) {
    await sql`UPDATE onus_pipeline SET risco_nivel = ${nivel}, risco_resumo = ${resumo}, atualizado_em = now() WHERE link = ${link}`
  }
}
console.log(COMMIT ? '\n✓ gravado' : '\n(dry — rode com --commit)')
await sql.end()
