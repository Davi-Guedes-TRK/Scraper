'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PORTALS, portalKeys } from '@/lib/portals'

type ChartRow = { dia: string }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; color: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card rounded-lg p-3 text-sm">
      <p className="eyebrow text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-bold tabular">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

const AXIS = 'var(--muted-foreground)'

export function DashboardChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="dia" tick={{ fill: AXIS, fontSize: 11, fontFamily: 'Courier Prime, monospace' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11, fontFamily: 'Courier Prime, monospace' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(166,124,46,0.08)' }} />
        <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12, fontFamily: 'Courier Prime, monospace', color: 'var(--muted-foreground)' }} />
        {portalKeys.map((p, i) => (
          <Bar key={p} dataKey={PORTALS[p].label} stackId="a" fill={PORTALS[p].hex}
            radius={i === portalKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} maxBarSize={48}
            isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
