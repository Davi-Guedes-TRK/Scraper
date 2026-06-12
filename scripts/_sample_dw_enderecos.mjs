// Amostra read-only de endereços do dw_trk p/ desenhar o normalizador.
import postgres from 'postgres'
const sql = postgres(process.env.DW_TRK_URL, { max: 1, connect_timeout: 10 })

const amostra = await sql`
  SELECT logradouro, numero, complemento, bloco, unidade, bairro, regiao, cidade
  FROM nido_imoveis
  WHERE logradouro IS NOT NULL
  ORDER BY data_atualizacao DESC NULLS LAST
  LIMIT 25`
console.log('── Amostra geral ──')
for (const r of amostra) console.log(JSON.stringify(r))

const lago = await sql`
  SELECT logradouro, numero, complemento, bloco, unidade, bairro, regiao
  FROM nido_imoveis
  WHERE bairro ILIKE '%lago sul%' OR regiao ILIKE '%lago sul%' OR logradouro ILIKE 'SHIS%'
  LIMIT 15`
console.log('\n── Lago Sul ──')
for (const r of lago) console.log(JSON.stringify(r))

const proprietarios = await sql`
  SELECT count(*)::int AS n FROM nido_pessoas WHERE e_proprietario`
console.log(`\nproprietários: ${proprietarios[0].n}`)
await sql.end()
