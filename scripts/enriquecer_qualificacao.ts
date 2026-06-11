/**
 * Enriquece contatos dos cards em Qualificação que têm CPF/CNPJ.
 * Busca no Skynet via Telegram → sobrescreve telefone_contato_1,
 * outros_contatos, e_mail no Pipefy e adiciona comentário.
 *
 *   npx tsx scripts/enriquecer_qualificacao.ts              # executa
 *   npx tsx scripts/enriquecer_qualificacao.ts --dry-run    # mostra sem gravar
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Carrega .env.local
const ROOT    = resolve(import.meta.dirname ?? __dirname, '..')
const envPath = resolve(ROOT, '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
// PIPEFY_TOKEN: pipefy_token_refresh.py renova em credentials/pipefy_token.txt
// (não no .env.local) — sempre usa o arquivo de credencial se existir
try {
  const fresh = readFileSync(resolve(ROOT, 'credentials', 'pipefy_token.txt'), 'utf8').trim()
  if (fresh) process.env.PIPEFY_TOKEN = fresh
} catch { /* usa o do .env.local */ }

import { lookupCPF, lookupCNPJ, type Telefone } from '@/lib/cpf-lookup'
import { updateCardField, createComment } from '@/lib/pipefy-update'

const DRY     = process.argv.includes('--dry-run')
const GQL_URL = 'https://api.pipefy.com/graphql'
const PIPE_ID = '307179010'

function normDoc(s: string) { return s.replace(/\D/g, '') }

function extractCPF(prop: string): string {
  const m = prop.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/)
  return m ? normDoc(m[0]) : ''
}

function extractCNPJ(prop: string): string {
  const m = prop.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
  return m ? normDoc(m[0]) : ''
}

function fmtTel(t: Telefone): string {
  return t.whatsapp === 'Sim' ? `${t.numero} (WZ)` : t.numero
}

async function pipefyGql(query: string) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PIPEFY_TOKEN}` },
    body: JSON.stringify({ query }),
  })
  const json = await res.json() as { data: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))
  return json.data as Record<string, unknown>
}

async function main() {
  const data   = await pipefyGql(`{
    pipe(id: ${PIPE_ID}) {
      phases {
        name
        cards(first: 200) {
          edges { node { id fields { field { id } value } } }
        }
      }
    }
  }`)

  const phases    = (data as any).pipe.phases as { name: string; cards: { edges: { node: any }[] } }[]
  const qualPhase = phases.find(p => p.name === 'Qualificação')
  if (!qualPhase) { console.error('Fase Qualificação não encontrada'); process.exit(1) }

  const cards = qualPhase.cards.edges.map((e: any) => {
    const f: Record<string, string> = {}
    for (const fi of e.node.fields) f[fi.field.id] = (fi.value ?? '').trim()
    return { id: String(e.node.id), fields: f }
  })

  for (const card of cards) {
    const prop = card.fields['nome_do_propriet_rio_1'] ?? ''
    const cpf  = extractCPF(prop)
    const cnpj = extractCNPJ(prop)

    if (!cpf && !cnpj) {
      console.log(`[${card.id}] ${prop.slice(0, 35)} — sem CPF/CNPJ, pulado`)
      continue
    }

    console.log(`\n[${card.id}] ${prop.slice(0, 40)} | ${cpf || cnpj}`)

    try {
      let telefones: Telefone[] = []
      let email      = ''
      let comentario = ''

      if (cpf) {
        const r    = await lookupCPF(cpf)
        telefones  = r.telefones
        email      = r.emails[0] ?? ''
        comentario = `🔍 Enriquecimento Skynet — CPF ${cpf}\nNome: ${r.nome}\nIdade: ${r.idade ?? '?'}\nRenda: ${r.renda || '—'}\nE-mails: ${r.emails.join(', ') || '—'}\n\nContatos atualizados, puxados via telegram automaticamente`
      } else {
        const r    = await lookupCNPJ(cnpj)
        telefones  = [...r.telefones, ...(r.socioAdmin?.telefones ?? [])]
        comentario = `🔍 Enriquecimento Skynet — CNPJ ${cnpj}\nRazão Social: ${r.razaoSocial}\nSócio-Admin: ${r.socioAdmin?.nome ?? '—'}\n\nContatos atualizados, puxados via telegram automaticamente`
      }

      // WZ do Skynet vem sem informação — salva todos os válidos
      // TODO: validar via Evolution API quando Docker estiver rodando
      const [principal, ...demais] = telefones
      const telPrincipal = principal ? fmtTel(principal) : ''
      const outrosTels   = demais.length ? demais.map(fmtTel).join(' | ') : ''

      console.log(`  Tel principal : ${telPrincipal || '—'}`)
      console.log(`  Outros        : ${outrosTels   || '—'}`)
      console.log(`  E-mail        : ${email        || '—'}`)

      if (!DRY) {
        if (telPrincipal) await updateCardField(card.id, 'telefone_contato_1', telPrincipal)
        if (outrosTels)   await updateCardField(card.id, 'outros_contatos',    outrosTels)
        if (email)        await updateCardField(card.id, 'e_mail',             email)
        if (comentario)   await createComment(card.id, comentario)
        console.log('  ✓ salvo')
      } else {
        console.log('  (dry-run — nada gravado)')
      }

    } catch (err) {
      console.error(`  ERRO: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('\nConcluído.')
}

main().catch(err => { console.error(err); process.exit(1) })
