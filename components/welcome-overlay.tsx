'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { LogoMark } from '@/components/logo'

const STORAGE_KEY = 'trk_last_login'

export function WelcomeOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const today = new Date().toDateString()
    if (localStorage.getItem(STORAGE_KEY) !== today) {
      localStorage.setItem(STORAGE_KEY, today)
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 2200)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
          style={{ background: '#4A235A' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.3, 0.5, 1] }}
          >
            <LogoMark size={56} className="text-[#C39BD3]" />
          </motion.div>
          <motion.p
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: 'rgba(195,155,211,0.7)' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
          >
            Bom dia
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
