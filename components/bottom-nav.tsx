'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Papel } from '@/lib/supabase/profile'

const TABS = [
  {
    href: '/dashboard',
    label: 'Início',
    exact: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/triagem',
    label: 'Triagem',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
      </svg>
    ),
  },
  {
    href: '/visitas',
    label: 'Visitas',
    badge: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    href: '/in-loco',
    label: 'In Loco',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <circle cx="12" cy="11" r="2.5" />
      </svg>
    ),
  },
  {
    href: '/relatorio',
    label: 'Cartório',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

export function BottomNav({ papel: _papel }: { papel?: Papel }) {
  const pathname = usePathname()
  const [visitasCount, setVisitasCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/visitas/count')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setVisitasCount(d.count ?? 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)' }}
    >
      {TABS.map(tab => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        const count = tab.badge ? visitasCount : 0
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 cursor-pointer transition-colors relative"
            style={{
              color: isActive ? 'var(--chart-1)' : 'var(--muted-foreground)',
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <span className="relative">
              {tab.icon}
              {count > 0 && (
                <span
                  className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-white font-bold leading-none px-[3px]"
                  style={{ fontSize: '8px', background: 'var(--chart-1)' }}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
