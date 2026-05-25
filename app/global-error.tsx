'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global] erro crítico:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: '100vh', background: '#f6f2ec', color: '#2a2018', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', background: '#ffffff', border: '1px solid #e6ddd0', borderRadius: '16px', padding: '40px 32px', boxShadow: '0 8px 30px rgba(42,32,24,0.10)' }}>
          <div style={{ width: '56px', height: '56px', margin: '0 auto 20px', borderRadius: '16px', background: 'rgba(180,69,47,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b4452f' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>Algo deu muito errado</h1>
          <p style={{ fontSize: '14px', color: '#897866', margin: '0 0 24px' }}>O sistema encontrou um erro inesperado.</p>
          <button
            onClick={reset}
            style={{ width: '100%', height: '44px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: '#6e4d34', color: '#ffffff', fontSize: '14px', fontWeight: 700, fontFamily: 'system-ui, sans-serif', boxShadow: '0 2px 10px rgba(110,77,52,0.28)' }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  )
}
