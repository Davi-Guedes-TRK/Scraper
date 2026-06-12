// Inspeção read-only do dw_trk (Nido) — lista schemas/tabelas/colunas candidatas.
// Uso: $env:DW_TRK_URL = "postgresql://..."; node scripts/_inspect_dw.mjs
import postgres from 'postgres'

const url = process.env.DW_TRK_URL
if (!url) { console.error('Falta DW_TRK_URL no env'); process.exit(1) }
const sql = postgres(url, { max: 1, connect_timeout: 10 })

const tabelas = await sql`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY table_schema, table_name`
console.log('── Tabelas ──')
for (const t of tabelas) console.log(`${t.table_schema}.${t.table_name}`)

// colunas das tabelas com cara de imóvel/proprietário/pessoa/contato
const candidatas = tabelas.filter(t =>
  /imo|propriet|pessoa|contato|client|owner|endere/i.test(t.table_name))
for (const t of candidatas) {
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = ${t.table_schema} AND table_name = ${t.table_name}
    ORDER BY ordinal_position`
  const n = await sql.unsafe(
    `SELECT count(*)::int AS n FROM "${t.table_schema}"."${t.table_name}"`)
  console.log(`\n── ${t.table_schema}.${t.table_name} (${n[0].n} linhas) ──`)
  for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}`)
}
await sql.end()
