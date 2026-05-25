'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] erro de rota:', error)
  }, [error])

  return (
    <div className="min-h-full flex items-center justify-center p-6 page-enter">
      <div className="card rounded-2xl p-8 max-w-md w-full text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-destructive"
          style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' }}
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        <p className="eyebrow text-destructive mb-2">Erro</p>
        <h1 className="text-xl font-bold text-foreground font-display mb-2">Algo deu errado</h1>
        <p className="text-muted-foreground text-sm mb-1">Não foi possível carregar esta página.</p>
        {error?.digest && (
          <p className="text-muted-foreground/60 text-[11px] font-mono mb-6">ref: {error.digest}</p>
        )}

        <div className="flex flex-col gap-2.5 mt-6">
          <button onClick={reset} className="btn-primary w-full h-11 rounded-lg text-sm font-bold cursor-pointer">
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="w-full h-10 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors flex items-center justify-center cursor-pointer"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
