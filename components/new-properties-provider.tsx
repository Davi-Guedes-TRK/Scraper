'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useNewProperties } from '@/lib/hooks/use-new-properties'

type Ctx = ReturnType<typeof useNewProperties>

const NewPropertiesContext = createContext<Ctx | null>(null)

export function NewPropertiesProvider({ children }: { children: ReactNode }) {
  const value = useNewProperties()
  return <NewPropertiesContext.Provider value={value}>{children}</NewPropertiesContext.Provider>
}

export function useNewPropertiesCtx(): Ctx {
  const ctx = useContext(NewPropertiesContext)
  if (!ctx) throw new Error('useNewPropertiesCtx deve ser usado dentro de <NewPropertiesProvider>')
  return ctx
}
