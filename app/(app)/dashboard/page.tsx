import { createClient } from '@/lib/supabase/server'
import { classifyAnunciante, daysAgo, startOfToday } from '@/lib/formatters'
import { PORTALS, portalKeys } from '@/lib/portals'
import { withCache } from '@/lib/redis'
import { DashboardClient } from './dashboard-client'

export const metadata = { title: 'Dashboard · Velvet' }

async function getDashboardData() {
  const supabase = await createClient()

  const count = async (filters: [string, string, string | null][]) => {
    let q = supabase.from('imoveis_todos').select('*', { count: 'exact', head: true })
    for (const [col, op, val] of filters) {
      if (op === 'eq')      q = q.eq(col, val!)
      if (op === 'isnull')  q = q.is(col, null)
      if (op === 'notnull') q = q.not(col, 'is', null)
    }
    const { count: c } = await q
    return c ?? 0
  }

  // Counts do funil e gráfico — cacheados 60s (dados pesados, tolerantes a leve delay)
  const today = startOfToday()
  const cached = await withCache('dashboard:counts', 60, async () => {
    const [p, pv, v, ap, sol, rec, chart, col7, colPrev] = await Promise.all([
      count([['status_triagem', 'eq', 'pendente']]),
      count([['status_triagem', 'eq', 'para_visitar'], ['visitado_em', 'isnull', null]]),
      count([['visitado_em', 'notnull', null]]),
      count([['status_triagem', 'eq', 'aprovado']]),
      count([['status_solicitacao', 'eq', 'enviado']]),
      count([['status_solicitacao', 'eq', 'recebido']]),
      supabase.from('imoveis_todos').select('coletado_em,portal').gte('coletado_em', daysAgo(7)),
      supabase.from('imoveis_todos').select('*', { count: 'exact', head: true }).gte('coletado_em', daysAgo(7)),
      supabase.from('imoveis_todos').select('*', { count: 'exact', head: true }).gte('coletado_em', daysAgo(14)).lt('coletado_em', daysAgo(7)),
    ])
    return { p, pv, v, ap, sol, rec, chartData: chart.data, col7: col7.count ?? 0, colPrev: colPrev.count ?? 0 }
  })

  const pendentes   = cached.p
  const paraVisitar = cached.pv
  const visitados   = cached.v
  const aprovados   = cached.ap
  const solicitados = cached.sol
  const recebidos   = cached.rec
  const col7Raw     = { count: cached.col7 }
  const colPrevRaw  = { count: cached.colPrev }
  const chartRaw    = { data: cached.chartData }

  // Alertas e fila — sempre frescos (mostram dados de hoje/agora)
  const [alertasRaw, filaRaw] = await Promise.all([
      supabase.from('imoveis_todos')
        .select('link,titulo,bairro,cidade,preco,descricao,creci,nome_anunciante,tipo_anunciante,coletado_em,portal')
        .eq('status_triagem', 'pendente')
        .gte('coletado_em', today)
        .order('coletado_em', { ascending: false })
        .limit(50),
      supabase.from('imoveis_todos')
        .select('link,titulo,bairro,cidade,preco,descricao,creci,nome_anunciante,tipo_anunciante,coletado_em,portal')
        .eq('status_triagem', 'pendente')
        .order('coletado_em', { ascending: false })
        .limit(8),
    ])

  const funnelCounts: Record<string, number> = {
    pendentes, paraVisitar, visitados, aprovados, solicitados, recebidos,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alertas = (alertasRaw.data ?? []).filter((r: any) => classifyAnunciante(r) === 'proprietario')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fila = (filaRaw.data ?? []).map((r: any) => ({
    link: r.link, titulo: r.titulo, bairro: r.bairro, cidade: r.cidade,
    preco: r.preco, portal: r.portal, coletado_em: r.coletado_em,
    anunciante: classifyAnunciante(r),
  }))

  const coletados7d = col7Raw.count ?? 0
  const coletadosPrev = colPrevRaw.count ?? 0
  const coletaDelta = coletadosPrev > 0 ? Math.round(((coletados7d - coletadosPrev) / coletadosPrev) * 100) : null

  const byDay: Record<string, Record<string, number>> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const init: Record<string, number> = {}
    portalKeys.forEach(p => { init[p] = 0 })
    byDay[key] = init
  }
  for (const row of chartRaw.data ?? []) {
    const key = row.coletado_em?.slice(0, 10)
    if (key && byDay[key] && row.portal in byDay[key]) byDay[key][row.portal]++
  }
  const chartData = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const row: Record<string, string | number> = {
        dia: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      }
      portalKeys.forEach(p => { row[PORTALS[p].label] = counts[p] })
      return row
    })

  return { funnelCounts, alertas, chartData, fila, coletados7d, coletaDelta }
}

export default async function DashboardPage() {
  const { funnelCounts, alertas, chartData, fila, coletados7d, coletaDelta } = await getDashboardData()
  return (
    <DashboardClient
      funnelCounts={funnelCounts}
      alertas={alertas}
      chartData={chartData as { dia: string }[]}
      fila={fila}
      coletados7d={coletados7d}
      coletaDelta={coletaDelta}
    />
  )
}
