// Descobre (READ-ONLY) o pipe do form "SEC | Ônus" + field IDs do start form.
// Token: credentials/pipefy_token.txt (renovar com pipefy_token_refresh.py).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = readFileSync(resolve(ROOT, 'credentials', 'pipefy_token.txt'), 'utf8').trim()
const ORG = '300542579'

async function gql(query) {
  const r = await fetch('https://api.pipefy.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  })
  const j = await r.json()
  if (j.errors?.length) throw new Error(JSON.stringify(j.errors))
  return j.data
}

const org = await gql(`{ organization(id: ${ORG}) { name pipes { id name } } }`)
console.log(`Org: ${org.organization.name}`)
for (const p of org.organization.pipes) console.log(`  pipe ${p.id}: ${p.name}`)

const alvo = org.organization.pipes.find((p) => /onus|ônus/i.test(p.name))
if (!alvo) { console.log('\nNenhum pipe com "ônus" no nome — ver lista acima.'); process.exit(0) }

const det = await gql(`{ pipe(id: ${alvo.id}) {
  id name
  start_form_fields { id label type required options }
  phases { id name }
} }`)
console.log(`\n── ${det.pipe.name} (${det.pipe.id}) — start form ──`)
for (const f of det.pipe.start_form_fields) {
  console.log(`  ${f.id}  [${f.type}${f.required ? ', obrig.' : ''}]  ${f.label}${f.options?.length ? '  opções: ' + JSON.stringify(f.options) : ''}`)
}
console.log('\nFases:', det.pipe.phases.map((f) => f.name).join(' → '))
