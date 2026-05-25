'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { SearchInput, Select } from './ui/toolbar'
import { signOut } from '@/app/actions/auth'
import { useNewPropertiesCtx } from './new-properties-provider'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/scrapers': 'Scrapers',
  '/triagem': 'Fila de Triagem',
  '/extracaopistas': 'Extração de Pistas',
  '/visitas': 'Roteiro de Visitas',
  '/relatorio': 'Cartório',
}

function titleFor(pathname: string) {
  const hit = Object.keys(TITLES).find(p => pathname.startsWith(p))
  return hit ? TITLES[hit] : 'TRK Imóveis'
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return ref
}

export function Topbar({ email }: { email?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const { count, latestTitle, markSeen } = useNewPropertiesCtx()
  const [period, setPeriod] = useState('7')
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const notifRef = useOutside(() => setNotifOpen(false))
  const userRef = useOutside(() => setUserOpen(false))

  // Páginas cuja lista é filtrada ao vivo pela busca global (via ?q=)
  const FILTERABLE = ['/triagem']
  const isFilterable = FILTERABLE.some(p => pathname.startsWith(p))
  const [query, setQuery] = useState(params.get('q') ?? '')
  const lastPath = useRef(pathname)

  const applyQuery = (v: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (v.trim()) sp.set('q', v.trim()); else sp.delete('q')
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Ao trocar de página, ressincroniza a busca com a URL
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname
      setQuery(params.get('q') ?? '')
    }
  }, [pathname, params])

  // Filtro ao vivo (debounced) nas páginas filtráveis
  useEffect(() => {
    if (!isFilterable) return
    if (query === (params.get('q') ?? '')) return
    const t = setTimeout(() => applyQuery(query), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isFilterable, pathname])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const v = query.trim()
    if (isFilterable) applyQuery(v)
    else if (v) router.push(`/triagem?q=${encodeURIComponent(v)}`)
  }

  return (
    <header
      className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 flex-shrink-0"
      style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--sidebar-border)' }}
    >
      {/* Título da página */}
      <h1 className="font-display font-bold text-foreground text-[15px] tracking-tight flex-shrink-0 min-w-0 truncate">
        {titleFor(pathname)}
      </h1>

      {/* Busca */}
      <form onSubmit={submitSearch} className="flex-1 max-w-md mx-auto hidden sm:block">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar imóvel, bairro, anunciante…" />
      </form>

      {/* Ações */}
      <div className="flex items-center gap-1.5 ml-auto sm:ml-0 flex-shrink-0">
        <div className="hidden md:block">
          <Select
            value={period}
            onChange={setPeriod}
            options={[
              { value: '7', label: 'Últimos 7 dias' },
              { value: '30', label: 'Últimos 30 dias' },
              { value: '90', label: 'Últimos 90 dias' },
            ]}
          />
        </div>

        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer"
            aria-label="Notificações"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {count > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] text-[9px] font-bold rounded-full flex items-center justify-center px-1 text-primary-foreground font-mono" style={{ background: 'var(--primary)' }}>
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-11 w-72 card rounded-xl p-2 z-40" style={{ animation: 'pop 140ms ease-out both' }}>
              <p className="eyebrow text-muted-foreground px-2 py-1.5">Notificações</p>
              {count > 0 ? (
                <Link
                  href="/triagem?novos=1"
                  onClick={() => { markSeen(); setNotifOpen(false) }}
                  className="block px-2 py-2 rounded-lg hover:bg-accent/60 transition-colors"
                >
                  <p className="text-sm text-foreground font-medium">{count} {count === 1 ? 'novo imóvel' : 'novos imóveis'} na triagem</p>
                  {latestTitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{latestTitle}</p>}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground px-2 py-3 text-center">Tudo em dia.</p>
              )}
            </div>
          )}
        </div>

        <ThemeToggle />

        {/* Usuário */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(o => !o)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-primary-foreground text-xs font-bold cursor-pointer font-mono"
            style={{ background: 'var(--primary)' }}
            aria-label="Conta"
          >
            {(email?.[0] ?? 'U').toUpperCase()}
          </button>

          {userOpen && (
            <div className="absolute right-0 top-11 w-56 card rounded-xl p-2 z-40" style={{ animation: 'pop 140ms ease-out both' }}>
              {email && <p className="text-xs text-muted-foreground font-mono px-2 py-1.5 truncate" title={email}>{email}</p>}
              <div className="h-px my-1" style={{ background: 'var(--border)' }} />
              <form action={signOut}>
                <button type="submit" className="flex items-center gap-2.5 text-sm text-foreground hover:bg-accent/60 px-2 py-2 rounded-lg transition-colors w-full cursor-pointer">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Sair
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
    </header>
  )
}
