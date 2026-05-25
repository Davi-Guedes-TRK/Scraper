'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  render?: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  empty = 'Nada por aqui.',
}: {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T, i: number) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
}) {
  const alignCls = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2.5 eyebrow text-muted-foreground/70 font-semibold whitespace-nowrap',
                  alignCls(col.align),
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground text-sm">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border/60 last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-accent/40',
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-3 py-2.5 align-middle', alignCls(col.align), col.className)}>
                    {col.render ? col.render(row) : (row as Record<string, ReactNode>)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
