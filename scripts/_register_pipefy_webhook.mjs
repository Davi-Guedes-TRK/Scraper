// Registra (idempotente) o webhook de tempo-real no pipe COM-Oportunidades.
// Lê PIPEFY_TOKEN e SCRAPER_API_KEY do .env.local. Não imprime a URL (tem segredo).
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1] ?? '').trim()
const TOKEN = get('PIPEFY_TOKEN')
const KEY = get('PIPEFY_WEBHOOK_SECRET')
const PIPE = '307179010'
if (!KEY) { console.error('Falta PIPEFY_WEBHOOK_SECRET no .env.local'); process.exit(1) }
const URL = `https://erp-trk.vercel.app/api/pipefy/webhook?token=${KEY}`
const ACTIONS = ['card.create', 'card.move', 'card.field_update', 'card.done', 'card.delete']

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

// 1) já existe um webhook nosso?
const list = await gql(`{ pipe(id: ${PIPE}) { webhooks { id name url } } }`)
const hooks = list.pipe?.webhooks ?? []
const existing = hooks.find(h => (h.url || '').includes('/api/pipefy/webhook'))
if (existing) {
  console.log(`Webhook já existe (id ${existing.id}, name "${existing.name}") — nada a fazer.`)
  process.exit(0)
}

// 2) cria
const actionsGql = '[' + ACTIONS.map(a => `"${a}"`).join(', ') + ']'
const data = await gql(`mutation {
  createWebhook(input: {
    pipe_id: ${PIPE}, name: "erp-trk-realtime", email: "", url: "${URL}", actions: ${actionsGql}
  }) { webhook { id name actions } }
}`)
const w = data.createWebhook?.webhook
console.log(`Webhook criado: id ${w?.id}, actions [${(w?.actions || []).join(', ')}]`)
