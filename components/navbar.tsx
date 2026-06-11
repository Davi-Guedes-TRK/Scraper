'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LogoMark, LogoHorizontal } from './logo'
import { useNewPropertiesCtx } from './new-properties-provider'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Analítico',
    items: [
      {
        href: '/analitico/funil',
        label: 'Funil de Captação',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 8h12M9 12h6M11 16h2M12 20h0" />
          </svg>
        ),
      },
      {
        href: '/analitico/funil-inquilinos',
        label: 'Funil de Inquilinos',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="9" cy="8" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 20a6 6 0 0112 0M16 7.5a3 3 0 010 5M21 20a6 6 0 00-3.6-5.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Captação',
    items: [
      {
        href: '/triagem',
        label: 'Portais',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
          </svg>
        ),
      },
      {
        href: '/in-loco',
        label: 'In Loco',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
        ),
      },
      {
        href: '/captacao',
        label: 'Alugamos não Adm.',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" />
            <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        ),
      },
      {
        href: '/carteira-paralela',
        label: 'Carteira Paralela',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        ),
      },
      {
        href: '/lancamentos',
        label: 'Lançamentos',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" />
          </svg>
        ),
      },
      {
        href: '/busca-pessoa',
        label: 'Busca Pessoa',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 8a3 3 0 100 6 3 3 0 000-6z" />
          </svg>
        ),
      },
      {
        href: '/geoportal',
        label: 'Geoportal',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l6 3V10m-6 7V4m0 0l6-3" />
            <circle cx="15.5" cy="9.5" r="1" fill="currentColor" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Campo',
    items: [
      {
        href: '/visitas',
        label: 'Visitas',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Documentos',
    items: [
      {
        href: '/relatorio',
        label: 'Cartório',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        href: '/scrapers',
        label: 'Scrapers',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        ),
      },
    ],
  },
]

const STORAGE_KEY_COLLAPSED = 'nav-collapsed'
const STORAGE_KEY_GROUPS = 'nav-groups-collapsed'

function loadGroupsState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_GROUPS) ?? '{}')
  } catch {
    return {}
  }
}

export function Navbar() {
  const pathname = usePathname()
  const { count, markSeen } = useNewPropertiesCtx()

  const [collapsed, setCollapsed] = useState(false)
  const [groupsCollapsed, setGroupsCollapsed] = useState<Record<string, boolean>>({})
  const [badgePulse, setBadgePulse] = useState(false)
  const prevCount = useRef(0)

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1')
    setGroupsCollapsed(loadGroupsState())
  }, [])

  useEffect(() => {
    if (count > prevCount.current) {
      setBadgePulse(true)
      const t = setTimeout(() => setBadgePulse(false), 1200)
      return () => clearTimeout(t)
    }
    prevCount.current = count
  }, [count])

  useEffect(() => {
    if (pathname === '/triagem') markSeen()
  }, [pathname])

  const toggle = () => setCollapsed(c => {
    const next = !c
    localStorage.setItem(STORAGE_KEY_COLLAPSED, next ? '1' : '0')
    return next
  })

  const toggleGroup = (label: string) => {
    setGroupsCollapsed(prev => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(next))
      return next
    })
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col h-screen sticky top-0 z-20 transition-[width] duration-200"
      style={{
        width: collapsed ? '3.25rem' : '14rem',
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Marca */}
      <div
        className="h-14 flex items-center flex-shrink-0 overflow-hidden"
        style={{ borderBottom: '1px solid var(--sidebar-border)', padding: collapsed ? '0 0.25rem' : '0 1rem' }}
      >
        {collapsed
          ? <LogoMark size={44} />
          : <LogoHorizontal height={40} />
        }
      </div>

      {/* Navegação */}
      <nav
        className="flex-1 py-3 flex flex-col gap-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: '0.75rem 0.5rem' }}
      >
        {NAV_GROUPS.map((group, gi) => {
          const groupKey = group.label ?? `__ungrouped_${gi}`
          const isGroupCollapsed = group.label ? !!groupsCollapsed[group.label] : false

          return (
            <div key={groupKey}>
              {/* Category header — only for named groups */}
              {group.label && !collapsed && (
                <button
                  onClick={() => toggleGroup(group.label!)}
                  className="w-full flex items-center justify-between px-2 py-1 mb-0.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                >
                  <span className="eyebrow text-[9px]">{group.label}</span>
                  <svg
                    className="w-3 h-3 transition-transform duration-150"
                    style={{ transform: isGroupCollapsed ? 'rotate(-90deg)' : 'none' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              {group.label && collapsed && <div className="h-px bg-border mx-1 mb-2 mt-1" />}

              {/* Items — hidden when group is collapsed; always visible in icon-only sidebar */}
              {(!isGroupCollapsed || collapsed) && group.items.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const isActive = item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname.startsWith(item.href)
                    const showBadge = item.href === '/triagem' && count > 0

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex items-center rounded-lg text-sm transition-all duration-150 cursor-pointer overflow-hidden ${
                          collapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-2.5 py-2'
                        } ${
                          isActive
                            ? 'text-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                        }`}
                        style={isActive ? { background: 'var(--accent)' } : undefined}
                      >
                        {isActive && !collapsed && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full" style={{ background: 'var(--foreground)' }} />
                        )}
                        <span className="flex-shrink-0">{item.icon}</span>
                        {!collapsed && <span className="flex-1 text-[13px] truncate">{item.label}</span>}
                        {showBadge && !collapsed && (
                          <span
                            className={`min-w-[16px] h-4 text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none font-mono transition-transform ${badgePulse ? 'animate-bounce' : ''}`}
                            style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                        {showBadge && collapsed && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--foreground)' }} />
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Toggle + rodapé */}
      <div className="flex-shrink-0 flex flex-col" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex items-center justify-center h-10 w-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4 transition-transform duration-200" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="ml-2 text-[11px]">Recolher</span>}
        </button>
      </div>
    </aside>
  )
}
