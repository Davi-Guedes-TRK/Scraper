// Dados de mercado para o dashboard imobiliário (/mercado).
// Ações do setor via Yahoo Finance (sem auth); macro via Banco Central (BCB SGS).
// Tudo grátis. Degradação silenciosa: fonte que cair vira null/omitida.

export type Acao = {
  symbol: string          // sem o sufixo .SA
  nome: string
  grupo: 'Construtora' | 'Shopping/Renda' | 'Índice'
  preco: number | null
  variacao: number | null // % no dia
  spark: number[]         // fechamentos recentes (mini-gráfico)
}

export type Indicador = {
  chave: string
  label: string
  valor: number | null
  unidade: string
  data: string | null
  nota: string
}

export type Mercado = {
  atualizado: string
  ibovespa: Acao | null
  setorMedia: number | null   // variação média das ações do setor (proxy do "índice imobiliário")
  acoes: Acao[]
  indicadores: Indicador[]
}

// Setor imobiliário na B3 — incorporadoras/construtoras + shoppings/renda.
const ATIVOS: Array<{ symbol: string; nome: string; grupo: Acao['grupo'] }> = [
  { symbol: 'CYRE3', nome: 'Cyrela',        grupo: 'Construtora' },
  { symbol: 'MRVE3', nome: 'MRV',           grupo: 'Construtora' },
  { symbol: 'EZTC3', nome: 'EZTec',         grupo: 'Construtora' },
  { symbol: 'TEND3', nome: 'Tenda',         grupo: 'Construtora' },
  { symbol: 'DIRR3', nome: 'Direcional',    grupo: 'Construtora' },
  { symbol: 'CURY3', nome: 'Cury',          grupo: 'Construtora' },
  { symbol: 'PLPL3', nome: 'Plano&Plano',   grupo: 'Construtora' },
  { symbol: 'MDNE3', nome: 'Moura Dubeux',  grupo: 'Construtora' },
  { symbol: 'JHSF3', nome: 'JHSF (alto padrão)', grupo: 'Construtora' },
  { symbol: 'EVEN3', nome: 'Even',          grupo: 'Construtora' },
  { symbol: 'TRIS3', nome: 'Trisul',        grupo: 'Construtora' },
  { symbol: 'MULT3', nome: 'Multiplan',     grupo: 'Shopping/Renda' },
  { symbol: 'ALOS3', nome: 'Allos',         grupo: 'Shopping/Renda' },
  { symbol: 'IGTI11', nome: 'Iguatemi',     grupo: 'Shopping/Renda' },
  { symbol: 'LOGG3', nome: 'LOG CP',        grupo: 'Shopping/Renda' },
  { symbol: 'SYNE3', nome: 'SYN',           grupo: 'Shopping/Renda' },
]

const YF = 'https://query1.finance.yahoo.com/v8/finance/chart'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

async function yahoo(symbol: string): Promise<{ preco: number | null; variacao: number | null; spark: number[] }> {
  try {
    const r = await fetch(`${YF}/${encodeURIComponent(symbol)}?range=1mo&interval=1d`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { preco: null, variacao: null, spark: [] }
    const j = await r.json()
    const m = j.chart?.result?.[0]?.meta
    const closes: number[] = (j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [])
      .filter((n: number | null): n is number => typeof n === 'number')
    const preco = m?.regularMarketPrice ?? null
    const prev = m?.chartPreviousClose ?? null
    const variacao = preco != null && prev ? ((preco - prev) / prev) * 100 : null
    return { preco, variacao, spark: closes.slice(-20) }
  } catch {
    return { preco: null, variacao: null, spark: [] }
  }
}

// BCB SGS: série mensal/diária. Devolve o último valor.
async function bcb(serie: number): Promise<{ valor: number | null; data: string | null }> {
  try {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
      { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { valor: null, data: null }
    const j = await r.json()
    const ultimo = j[j.length - 1]
    return { valor: ultimo ? parseFloat(ultimo.valor) : null, data: ultimo?.data ?? null }
  } catch {
    return { valor: null, data: null }
  }
}

export async function carregarMercado(): Promise<Mercado> {
  const [cotacoes, ibov, selic, igpm, incc, ipca] = await Promise.all([
    Promise.all(ATIVOS.map(async a => ({ ...a, ...(await yahoo(`${a.symbol}.SA`)) }))),
    yahoo('^BVSP'),
    bcb(432), // meta SELIC % a.a.
    bcb(189), // IGP-M % mês (reajuste de aluguel)
    bcb(192), // INCC-M % mês (custo de construção)
    bcb(433), // IPCA % mês
  ])

  const acoes: Acao[] = cotacoes.map(c => ({
    symbol: c.symbol, nome: c.nome, grupo: c.grupo,
    preco: c.preco, variacao: c.variacao, spark: c.spark,
  }))
  const validas = acoes.filter(a => a.variacao != null)
  const setorMedia = validas.length
    ? validas.reduce((s, a) => s + (a.variacao ?? 0), 0) / validas.length
    : null

  const indicadores: Indicador[] = [
    { chave: 'selic', label: 'SELIC (meta)', valor: selic.valor, unidade: '% a.a.', data: selic.data, nota: 'custo do financiamento' },
    { chave: 'igpm', label: 'IGP-M', valor: igpm.valor, unidade: '% mês', data: igpm.data, nota: 'reajuste de aluguel' },
    { chave: 'incc', label: 'INCC', valor: incc.valor, unidade: '% mês', data: incc.data, nota: 'custo de construção' },
    { chave: 'ipca', label: 'IPCA', valor: ipca.valor, unidade: '% mês', data: ipca.data, nota: 'inflação oficial' },
  ]

  return {
    atualizado: new Date().toISOString(),
    ibovespa: ibov.preco != null
      ? { symbol: 'IBOV', nome: 'Ibovespa', grupo: 'Índice', preco: ibov.preco, variacao: ibov.variacao, spark: ibov.spark }
      : null,
    setorMedia,
    acoes: acoes.sort((a, b) => (b.variacao ?? -999) - (a.variacao ?? -999)), // maiores altas no topo
    indicadores,
  }
}
