// Teste descartável do dedup contra o espelho dw_imoveis.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { enderecoNorm, chaveEndereco } from '../lib/endereco-normalizar.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const sql = postgres(url, { ssl: 'require', max: 1 })

const casos = [
  'SHIS QI 9, Conjunto 4, Casa 15 — Lago Sul, Brasília/DF', // existe (veio da amostra)
  'SQSW 306 Bloco F Apto 206, Sudoeste',                    // existe (apartamento)
  'SHIS QL 99 Conjunto 99 Casa 99, Lago Sul',               // NÃO existe
]
for (const e of casos) {
  const c = chaveEndereco(e)
  const n = enderecoNorm(e)
  let r = []
  let via = 'chave'
  if (c.chave) {
    r = await sql`SELECT codigo_imovel, endereco_bruto, setor FROM dw_imoveis WHERE endereco_chave = ${c.chave}`
  }
  if (!r.length && n.length >= 8) {
    via = 'trgm'
    r = await sql`
      SELECT codigo_imovel, endereco_bruto, similarity(endereco_norm, ${n})::float AS sim
      FROM dw_imoveis WHERE endereco_norm % ${n} AND similarity(endereco_norm, ${n}) > 0.5
      ORDER BY sim DESC LIMIT 3`
  }
  console.log(`[${c.chave ?? 'sem chave'}] ${e}`)
  if (!r.length) console.log('   -> NENHUM (libera ônus)')
  for (const m of r) console.log(`   -> ${m.codigo_imovel}: ${m.endereco_bruto} (${via}${m.sim ? ' ' + m.sim.toFixed(2) : ''})`)
}
await sql.end()
