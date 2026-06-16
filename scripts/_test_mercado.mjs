// Testa a carga de mercado direto nas fontes (Yahoo + BCB). Sem Redis.
const YF = 'https://query1.finance.yahoo.com/v8/finance/chart'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
const ATIVOS = ['CYRE3.SA','MRVE3.SA','EZTC3.SA','TEND3.SA','DIRR3.SA','CURY3.SA','PLPL3.SA','MDNE3.SA','JHSF3.SA','EVEN3.SA','TRIS3.SA','MULT3.SA','ALOS3.SA','IGTI11.SA','LOGG3.SA','SYNE3.SA']

async function yf(sym) {
  try {
    const r = await fetch(`${YF}/${encodeURIComponent(sym)}?range=1mo&interval=1d`, { headers: { 'User-Agent': UA } })
    if (!r.ok) return { sym, err: r.status }
    const j = await r.json()
    const m = j.chart?.result?.[0]?.meta
    const v = m ? ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100 : null
    return { sym, preco: m?.regularMarketPrice, var: v == null ? null : Math.round(v * 100) / 100 }
  } catch (e) { return { sym, err: e.message } }
}
async function bcb(s) {
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados/ultimos/1?formato=json`)
  const j = await r.json(); return j[0]
}

const acoes = await Promise.all(ATIVOS.map(yf))
acoes.sort((a, b) => (b.var ?? -999) - (a.var ?? -999))
console.log('── Setor imobiliário (maiores altas no topo) ──')
for (const a of acoes) console.log(`  ${a.sym.replace('.SA','').padEnd(7)} ${a.err ? 'ERRO '+a.err : `R$ ${a.preco}  ${a.var > 0 ? '+' : ''}${a.var}%`}`)
const validas = acoes.filter(a => a.var != null)
console.log(`  média do setor: ${(validas.reduce((s,a)=>s+a.var,0)/validas.length).toFixed(2)}%`)
console.log('\n── Macro (BCB) ──')
for (const [s, l] of [[432,'SELIC'],[189,'IGP-M'],[192,'INCC'],[433,'IPCA']]) {
  const d = await bcb(s); console.log(`  ${l}: ${d.valor} (${d.data})`)
}
