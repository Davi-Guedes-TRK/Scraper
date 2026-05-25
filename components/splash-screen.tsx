'use client'

import { useEffect, useState } from 'react'
import { LogoMark } from './logo'

export function SplashScreen() {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'gone'>('visible')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 1500)
    const t2 = setTimeout(() => setPhase('gone'), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center page-bg"
      style={{
        transition: 'opacity 480ms ease',
        opacity: phase === 'fading' ? 0 : 1,
        pointerEvents: phase === 'fading' ? 'none' : 'auto',
      }}
    >
      <div className="flex flex-col items-center" style={{ animation: 'splash-up 460ms cubic-bezier(0.2,0.7,0.2,1) both' }}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-primary-foreground"
          style={{
            background: 'var(--primary)',
            boxShadow: '0 8px 24px rgba(110,77,52,0.3)',
            animation: 'splash-pop 520ms cubic-bezier(0.34,1.4,0.5,1) 60ms both',
          }}
        >
          <LogoMark className="w-7 h-7" />
        </div>

        <div className="mt-5 text-center" style={{ animation: 'splash-up 420ms ease-out 180ms both', opacity: 0 }}>
          <p className="font-display text-lg font-extrabold text-foreground tracking-tight">TRK Imóveis</p>
          <p className="eyebrow text-muted-foreground mt-1">ERP · Captação</p>
        </div>
      </div>

      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-36">
        <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full"
            style={{ background: 'var(--primary)', animation: 'splash-bar 1500ms cubic-bezier(0.4,0,0.2,1) both' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splash-pop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes splash-bar { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </div>
  )
}
