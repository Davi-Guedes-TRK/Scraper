// Dedup contra o espelho do dw_trk (dw_imoveis/dw_pessoas, ver scripts/dw_sync.mjs).
// É o GATE antes de gastar ônus: imóvel já na base → avisa em vez de solicitar.
import sql from './db'
import { enderecoNorm, chaveEndereco, nomeNorm } from './endereco-normalizar'

export type DwImovelMatch = {
  codigo_imovel: string
  endereco_bruto: string | null
  setor: string | null
  bairro: string | null
  situacao: string | null
  preco_venda: number | null
  codigo_proprietario: string | null
  sim?: number
}

export type DedupImovel = {
  // exato: chave estruturada igual (quadra|cj/bl|unidade) e setor compatível.
  // provavel: só fuzzy (trgm) — alguém precisa bater o olho.
  nivel: 'exato' | 'provavel' | 'nenhum'
  matches: DwImovelMatch[]
}

const COLS = sql`codigo_imovel, endereco_bruto, setor, bairro, situacao, preco_venda, codigo_proprietario`

export async function buscarImovelNoDw(endereco: string): Promise<DedupImovel> {
  const c = chaveEndereco(endereco)
  const norm = enderecoNorm(endereco)

  if (c.chave) {
    const rows = await sql<DwImovelMatch[]>`
      SELECT ${COLS} FROM dw_imoveis WHERE endereco_chave = ${c.chave}`
    // setor derruba o match SÓ quando os dois lados têm e são incompatíveis
    // ("SHI" truncado do Nido ainda casa com "SHIS" por prefixo).
    const ok = rows.filter(r =>
      !r.setor || !c.setor || r.setor.startsWith(c.setor) || c.setor.startsWith(r.setor))
    if (ok.length) return { nivel: 'exato', matches: ok }
  }

  if (norm.length >= 8) {
    // Se o lead TEM chave e não bateu exato acima, linhas com chave diferente são
    // outro imóvel — o fuzzy só procura nas linhas SEM chave (33% do espelho).
    const rows = await sql<DwImovelMatch[]>`
      SELECT ${COLS}, similarity(endereco_norm, ${norm})::float AS sim
      FROM dw_imoveis
      WHERE endereco_norm % ${norm} AND similarity(endereco_norm, ${norm}) > 0.5
        AND ${c.chave ? sql`endereco_chave IS NULL` : sql`true`}
      ORDER BY sim DESC LIMIT 5`
    if (rows.length) return { nivel: 'provavel', matches: rows }
  }

  return { nivel: 'nenhum', matches: [] }
}

export type DwPessoaMatch = {
  codigo_pessoa: string
  nome: string | null
  e_proprietario: boolean | null
  telefones: string[]
  emails: string[]
  sim?: number
}

export type DedupPessoa = {
  // Nido não tem CPF — match é por NOME normalizado; homônimos existem,
  // tratar 'exato' como "provável forte", não como certeza.
  nivel: 'exato' | 'provavel' | 'nenhum'
  matches: DwPessoaMatch[]
}

export async function buscarPessoaNoDw(nome: string): Promise<DedupPessoa> {
  const n = nomeNorm(nome)
  if (!n) return { nivel: 'nenhum', matches: [] }

  const exatos = await sql<DwPessoaMatch[]>`
    SELECT codigo_pessoa, nome, e_proprietario, telefones, emails
    FROM dw_pessoas WHERE nome_norm = ${n} LIMIT 5`
  if (exatos.length) return { nivel: 'exato', matches: exatos }

  const parecidos = await sql<DwPessoaMatch[]>`
    SELECT codigo_pessoa, nome, e_proprietario, telefones, emails,
           similarity(nome_norm, ${n})::float AS sim
    FROM dw_pessoas
    WHERE nome_norm % ${n} AND similarity(nome_norm, ${n}) > 0.65
    ORDER BY sim DESC LIMIT 5`
  if (parecidos.length) return { nivel: 'provavel', matches: parecidos }

  return { nivel: 'nenhum', matches: [] }
}
