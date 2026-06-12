// Descartável: field IDs do pipe COM - Oportunidades (start form + fases).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = readFileSync(resolve(ROOT, 'credentials', 'pipefy_token.txt'), 'utf8').trim()

const r = await fetch('https://api.pipefy.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ query: `{ pipe(id: 307179010) {
    start_form_fields { id label type }
    phases { name fields { id label type } }
  } }` }),
})
const j = await r.json()
if (j.errors?.length) { console.error(JSON.stringify(j.errors)); process.exit(1) }
console.log('── start form ──')
for (const f of j.data.pipe.start_form_fields) console.log(`  ${f.id}  [${f.type}]  ${f.label}`)
for (const ph of j.data.pipe.phases) {
  if (!ph.fields?.length) continue
  console.log(`── fase: ${ph.name} ──`)
  for (const f of ph.fields) console.log(`  ${f.id}  [${f.type}]  ${f.label}`)
}
