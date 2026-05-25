'use client'

import Link from 'next/link'
import { NumberTicker } from './number-ticker'

export type StatTileProps = {
  label: string
  value: number
  sublabel?: string
  accent?: string
  href?: string
  /** participação no funil (0–100) → barra fina */
  share?: number
  /** variação real, ex.: +12 ou -3 (em %). Só passe se for dado real. */
  delta?: number
  deltaLabel?: string
}

export function StatTile({ label, value, sublabel, accent = '#6e4d34', href, share, delta, deltaLabel }: StatTileProps) {
  const body = (
    <div className="card card-hover rounded-lg p-3 h-full">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
        <p className="eyebrow text-muted-foreground truncate">{label}</p>
      </div>

      <div className="flex items-end justify-between gap-2">
        <NumberTicker value={value} className="text-[22px] font-extrabold font-display tabular text-foreground leading-none" />
        {typeof delta === 'number' && (
          <span
            className="text-[11px] font-bold font-mono flex items-center gap-0.5 mb-0.5"
            style={{ color: delta > 0 ? '#5d7a43' : delta < 0 ? '#b4452f' : '#897866' }}
            title={deltaLabel}
          >
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}{Math.abs(delta)}%
          </span>
        )}
      </div>

      {sublabel && <p className="text-muted-foreground text-xs mt-1.5 truncate">{sublabel}</p>}

      {typeof share === 'number' && (
        <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--secondary)' }}>
          <div className="h-full rounded-full" style={{ background: accent, width: `${Math.max(2, Math.min(100, share))}%` }} />
        </div>
      )}
    </div>
  )

  return href ? <Link href={href} className="block group">{body}</Link> : body
}
