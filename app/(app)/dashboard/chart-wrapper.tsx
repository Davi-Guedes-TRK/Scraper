'use client'

import dynamic from 'next/dynamic'

const DashboardChart = dynamic(
  () => import('./dashboard-chart').then(m => m.DashboardChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-slate-100 rounded-lg" /> }
)

export { DashboardChart }
