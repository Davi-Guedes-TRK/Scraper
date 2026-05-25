import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow, title, subtitle, actions,
}: {
  eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-primary mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold text-foreground font-display tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
