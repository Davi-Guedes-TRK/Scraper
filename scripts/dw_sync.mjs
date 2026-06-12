// Ponte dw_trk (Nido, rede local) → espelho no Supabase (dw_imoveis / dw_pessoas).
// Roda como Tarefa Agendada do Windows na máquina do Davi (única que alcança
// 192.168.64.106). Lê DW_TRK_URL e DATABASE_URL do .env.local — cwd-independente.
//
// Uso:  node scripts/dw_sync.mjs            (sync completo, upsert em lotes)
//       node scripts/dw_sync.mjs --dry-run  (só conta e mostra amostra)
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { enderecoNorm, chaveEndereco, nomeNorm } from '../lib/endereco-normalizar.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const get = (k) => process.env[k] || (env.match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1] ?? '').trim()

const DRY = process.argv.includes('--dry-run')
const DW_URL = get('DW_TRK_URL')
const SB_URL = get('DATABASE_URL')
if (!DW_URL || !SB_URL) { console.error('Falta DW_TRK_URL ou DATABASE_URL no .env.local'); process.exit(1) }

const dw = postgres(DW_URL, { max: 1, connect_timeout: 15 })
const sb = postgres(SB_URL, { ssl: 'require', max: 1, idle_timeout: 30 })

async function gchat(texto) {
  const url = get('GCHAT_WEBHOOK_URL')
  if (!url) return
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto }) })
  } catch { /* log é melhor-esforço */ }
}

// ── Imóveis ──────────────────────────────────────────────────────────────────
function montarBruto(r) {
  // Nido usa "0"/0 como vazio em bloco e número — não deixar virar "BL 0"/"N 0".
  // unidade do Nido é ruidosa ("10100", "133") — só entra se a chave ficou sem unidade.
  const numero = r.numero && Number(r.numero) > 0 ? `N ${r.numero}` : ''
  const bloco = r.bloco && String(r.bloco).trim() !== '0' ? `BL ${r.bloco}` : ''
  return [r.logradouro, r.complemento, numero, bloco]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

const imoveis = await dw`
  SELECT codigo_imovel, codigo_proprietario, logradouro, numero, complemento, bloco,
         unidade, bairro, cidade, tipo_imovel, situacao, disponivel_venda, preco_venda,
         data_atualizacao
  FROM nido_imoveis`
console.log(`dw_trk: ${imoveis.length} imóveis lidos`)

const linhasImoveis = imoveis.map((r) => {
  let bruto = montarBruto(r)
  let c = chaveEndereco(bruto)
  if (!c.chave && r.unidade && /^\d{1,4}[A-Z]?$/i.test(String(r.unidade).trim()) && !/^0+$/.test(String(r.unidade).trim())) {
    const tentativa = chaveEndereco(`${bruto} N ${String(r.unidade).trim()}`)
    if (tentativa.chave) { bruto = `${bruto} N ${String(r.unidade).trim()}`; c = tentativa }
  }
  return {
    codigo_imovel: r.codigo_imovel,
    codigo_proprietario: r.codigo_proprietario ?? null,
    endereco_bruto: bruto || null,
    endereco_norm: enderecoNorm(bruto) || null,
    endereco_chave: c.chave,
    setor: c.setor ?? null,
    bairro: r.bairro ?? null,
    cidade: r.cidade ?? null,
    tipo_imovel: r.tipo_imovel ?? null,
    situacao: r.situacao ?? null,
    disponivel_venda: r.disponivel_venda ?? null,
    preco_venda: r.preco_venda ?? null,
    data_atualizacao: r.data_atualizacao ?? null,
  }
})
const comChave = linhasImoveis.filter((l) => l.endereco_chave).length
console.log(`  com chave estruturada: ${comChave} (${Math.round((100 * comChave) / (linhasImoveis.length || 1))}%)`)

// ── Pessoas ──────────────────────────────────────────────────────────────────
const pessoas = await dw`
  SELECT codigo_pessoa, nome, e_proprietario, cidade, uf,
         telefone_1, telefone_2, telefone_3, email_1, email_2, email_3
  FROM nido_pessoas`
console.log(`dw_trk: ${pessoas.length} pessoas lidas`)

const linhasPessoas = pessoas.map((r) => ({
  codigo_pessoa: r.codigo_pessoa,
  nome: r.nome ?? null,
  nome_norm: nomeNorm(r.nome) || null,
  e_proprietario: r.e_proprietario ?? null,
  telefones: [r.telefone_1, r.telefone_2, r.telefone_3].map((t) => (t ?? '').trim()).filter(Boolean),
  emails: [r.email_1, r.email_2, r.email_3].map((e) => (e ?? '').trim()).filter(Boolean),
  cidade: r.cidade ?? null,
  uf: r.uf ?? null,
}))

if (DRY) {
  console.log('\n[dry-run] amostra imóveis:')
  for (const l of linhasImoveis.slice(0, 8)) console.log(`  ${l.endereco_chave ?? '(sem chave)'}  <- ${l.endereco_bruto}`)
  console.log('[dry-run] nada gravado.')
  await dw.end(); await sb.end(); process.exit(0)
}

// ── Upsert em lotes no Supabase ──────────────────────────────────────────────
const LOTE = 500
const COLS_I = ['codigo_imovel','codigo_proprietario','endereco_bruto','endereco_norm','endereco_chave','setor','bairro','cidade','tipo_imovel','situacao','disponivel_venda','preco_venda','data_atualizacao']
for (let i = 0; i < linhasImoveis.length; i += LOTE) {
  const lote = linhasImoveis.slice(i, i + LOTE)
  await sb`
    INSERT INTO dw_imoveis ${sb(lote, ...COLS_I)}
    ON CONFLICT (codigo_imovel) DO UPDATE SET
      ${sb.unsafe(COLS_I.slice(1).map((c) => `${c} = EXCLUDED.${c}`).join(', '))},
      sincronizado_em = now()`
}
console.log(`supabase: ${linhasImoveis.length} imóveis upsertados`)

const COLS_P = ['codigo_pessoa','nome','nome_norm','e_proprietario','telefones','emails','cidade','uf']
for (let i = 0; i < linhasPessoas.length; i += LOTE) {
  const lote = linhasPessoas.slice(i, i + LOTE)
  await sb`
    INSERT INTO dw_pessoas ${sb(lote, ...COLS_P)}
    ON CONFLICT (codigo_pessoa) DO UPDATE SET
      ${sb.unsafe(COLS_P.slice(1).map((c) => `${c} = EXCLUDED.${c}`).join(', '))},
      sincronizado_em = now()`
}
console.log(`supabase: ${linhasPessoas.length} pessoas upsertadas`)

await gchat(`🔄 dw_sync ok: ${linhasImoveis.length} imóveis (${comChave} c/ chave), ${linhasPessoas.length} pessoas`)
await dw.end()
await sb.end()
console.log('Pronto.')
