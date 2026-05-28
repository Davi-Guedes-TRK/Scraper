'use client'

import { useActionState, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { signIn, resetPassword } from '@/app/actions/auth'
import { PATH_1, PATH_2, VIEWBOX } from '@/components/logo'

type Mode = 'login' | 'forgot' | 'forgot_sent'

const initialLogin = { error: null }
const initialReset = { error: null, sent: false }

const BG = '#4A235A'
const LIGHT = '#C39BD3'

function Field({
  name, type = 'text', label, value, onChange, autoFocus,
}: {
  name: string; type?: string; label: string
  value?: string; onChange?: (v: string) => void; autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#64748b' }}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full h-10 px-3.5 rounded-lg text-sm text-slate-900 outline-none transition-all duration-150 bg-slate-50"
        style={{
          border: `1.5px solid ${focused ? BG : '#e2e8f0'}`,
          boxShadow: focused ? '0 0 0 3px rgba(74,35,90,0.12)' : 'none',
        }}
      />
    </div>
  )
}

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialLogin)
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, initialReset)

  useEffect(() => {
    if (resetState.sent) setMode('forgot_sent')
  }, [resetState.sent])

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: BG }}
    >
      {/* Watermark — canto inferior direito, parcialmente cortado */}
      <svg
        viewBox={VIEWBOX}
        aria-hidden
        className="absolute pointer-events-none select-none"
        style={{
          width: 600,
          height: Math.round(600 * 150 / 320),
          fill: LIGHT,
          opacity: 0.1,
          bottom: -60,
          right: -80,
        }}
      >
        <path d={PATH_1} />
        <path d={PATH_2} />
      </svg>

      <div className="w-full max-w-sm relative z-10">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <h2 className="text-lg font-bold text-slate-900 mb-1 font-display">Bem-vindo de volta</h2>
                <p className="text-slate-500 text-sm mb-6">Acesse sua conta para continuar.</p>

                <form action={loginAction} className="flex flex-col gap-3">
                  <Field name="email" type="email" label="Email" value={email} onChange={setEmail} autoFocus />
                  <Field name="password" type="password" label="Senha" />

                  <AnimatePresence>
                    {loginState.error && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-red-600 rounded-lg px-3 py-2 bg-red-50 border border-red-200"
                      >
                        {loginState.error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loginPending}
                    className="w-full mt-1 h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity disabled:opacity-60"
                    style={{ background: BG }}
                  >
                    {loginPending
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Entrando…
                        </span>
                      : 'Entrar'}
                  </button>
                </form>

                <button
                  onClick={() => setMode('forgot')}
                  className="mt-5 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-medium"
                >
                  Esqueci minha senha
                </button>
              </motion.div>
            )}

            {mode === 'forgot' && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <button
                  onClick={() => setMode('login')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-5 transition-colors cursor-pointer font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Voltar
                </button>

                <h2 className="text-lg font-bold text-slate-900 mb-1 font-display">Redefinir senha</h2>
                <p className="text-slate-500 text-sm mb-6">Enviaremos um link ao seu email.</p>

                <form action={resetAction} className="flex flex-col gap-3">
                  <Field name="email" type="email" label="Email" value={email} onChange={setEmail} autoFocus />

                  {resetState.error && (
                    <p className="text-xs text-red-600 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                      {resetState.error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetPending}
                    className="w-full mt-1 h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity disabled:opacity-60"
                    style={{ background: BG }}
                  >
                    {resetPending ? 'Enviando…' : 'Enviar link'}
                  </button>
                </form>
              </motion.div>
            )}

            {mode === 'forgot_sent' && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.34, 1.4, 0.5, 1] }}
                className="text-center py-4"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(74,35,90,0.08)' }}
                >
                  <svg className="w-7 h-7" style={{ color: BG }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-2 font-display">Email enviado</h2>
                <p className="text-slate-500 text-sm mb-6">
                  Verifique <span className="text-slate-900 font-semibold">{email}</span> e clique no link.
                </p>
                <button
                  onClick={() => setMode('login')}
                  className="text-xs font-semibold cursor-pointer hover:opacity-75 transition-opacity"
                  style={{ color: BG }}
                >
                  Voltar para o login
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p
          className="text-center text-[10px] font-medium mt-6 tracking-widest"
          style={{ color: 'rgba(195,155,211,0.45)' }}
        >
          © 2026 Velvet
        </p>
      </div>
    </div>
  )
}
