'use client'

import { ThemeProvider } from 'next-themes'
import { SplashScreen } from './splash-screen'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SplashScreen />
      {children}
    </ThemeProvider>
  )
}
