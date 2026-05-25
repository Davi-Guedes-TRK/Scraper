'use client'

import { useEffect, useState } from 'react'
import { LogoHorizontal } from './logo'

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
      <div
        className="flex flex-col items-center gap-2"
        style={{ animation: 'splash-up 460ms cubic-bezier(0.2,0.7,0.2,1) both' }}
      >
        <div style={{ animation: 'splash-pop 520ms cubic-bezier(0.34,1.4,0.5,1) 60ms both', opacity: 0 }}>
          <LogoHorizontal height={56} />
        </div>
        <p
          className="eyebrow text-muted-foreground"
          style={{ animation: 'splash-up 420ms ease-out 220ms both', opacity: 0 }}
        >
          Sistema Imobiliário
        </p>
      </div>

      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-36">
        <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full"
            style={{ background: 'var(--foreground)', animation: 'splash-bar 1500ms cubic-bezier(0.4,0,0.2,1) both' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splash-pop { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
        @keyframes splash-bar { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </div>
  )
}
