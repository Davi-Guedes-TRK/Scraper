// Mutations Pipefy para atualizar campos e criar comentários em cards existentes.

const GQL_URL = 'https://api.pipefy.com/graphql'

function token() {
  const t = process.env.PIPEFY_TOKEN
  if (!t) throw new Error('PIPEFY_TOKEN não configurado')
  return t
}

async function gql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Pipefy HTTP ${res.status}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data
}

export async function updateCardField(cardId: string, fieldId: string, value: string) {
  await gql(
    `mutation Update($input: UpdateCardFieldInput!) {
       updateCardField(input: $input) { card { id } }
     }`,
    { input: { card_id: cardId, field_id: fieldId, new_value: value } },
  )
}

export async function createComment(cardId: string, text: string) {
  await gql(
    `mutation Comment($input: CreateCommentInput!) {
       createComment(input: $input) { comment { id } }
     }`,
    { input: { card_id: cardId, text } },
  )
}
