'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { signIn, resetPassword } from '@/app/actions/auth'
import { PATH_1, PATH_2, VIEWBOX, APP_NAME } from '@/components/logo'

type Mode = 'login' | 'forgot' | 'forgot_sent'

const initialLogin = { error: null }
const initialReset = { error: null, sent: false }

const BG = '#4A235A'
const LIGHT = '#C39BD3'

function Field({
  id, name, type = 'text', label, autoComplete, value, onChange, autoFocus, errorId,
}: {
  id: string; name: string; type?: string; label: string; autoComplete?: string
  value?: string; onChange?: (v: string) => void; autoFocus?: boolean; errorId?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-widest uppercase"
        style={{ color: '#64748b' }}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-describedby={errorId}
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
  const uid = useId()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialLogin)
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, initialReset)

  const loginErrId = `${uid}-login-err`
  const resetErrId = `${uid}-reset-err`

  useEffect(() => {
    if (resetState.sent) setMode('forgot_sent')
  }, [resetState.sent])

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{ background: BG }}
    >
      {/* Watermark */}
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
        {/* Logo acima do card */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <svg
            viewBox={VIEWBOX}
            aria-label={APP_NAME}
            role="img"
            style={{ width: 64, height: Math.round(64 * 150 / 320), fill: LIGHT }}
          >
            <path d={PATH_1} />
            <path d={PATH_2} />
          </svg>
          <span
            className="tracking-tight text-2xl"
            style={{
              color: LIGHT,
              fontFamily: "'GFS Didot', 'Didot', 'Bodoni 72', 'Times New Roman', serif",
              fontWeight: 400,
            }}
          >
            {APP_NAME}
          </span>
          <p className="text-xs tracking-widest uppercase font-medium" style={{ color: 'rgba(195,155,211,0.6)' }}>
            Sistema Imobiliário
          </p>
        </div>

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
                <h1 className="text-lg font-bold text-slate-900 mb-1 font-display">Bem-vindo de volta</h1>
                <p className="text-slate-500 text-sm mb-6">Acesse sua conta para continuar.</p>

                <form action={loginAction} className="flex flex-col gap-3" noValidate>
                  <Field
                    id={`${uid}-email`}
                    name="email" type="email" label="Email"
                    autoComplete="email"
                    value={email} onChange={setEmail} autoFocus
                    errorId={loginErrId}
                  />
                  <Field
                    id={`${uid}-password`}
                    name="password" type="password" label="Senha"
                    autoComplete="current-password"
                    errorId={loginErrId}
                  />

                  <AnimatePresence>
                    {loginState.error && (
                      <motion.p
                        id={loginErrId}
                        role="alert"
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
                    className="w-full mt-1 h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ background: BG, outlineColor: BG }}
                  >
                    {loginPending
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                          Entrando…
                        </span>
                      : 'Entrar'}
                  </button>
                </form>

                <button
                  onClick={() => setMode('forgot')}
                  className="mt-5 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-medium focus-visible:underline"
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
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-5 transition-colors cursor-pointer font-medium focus-visible:underline"
                >
                  <svg className="w-3.5 h-3.5" aria-hidden fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Voltar
                </button>

                <h1 className="text-lg font-bold text-slate-900 mb-1 font-display">Redefinir senha</h1>
                <p className="text-slate-500 text-sm mb-6">Enviaremos um link ao seu email.</p>

                <form action={resetAction} className="flex flex-col gap-3" noValidate>
                  <Field
                    id={`${uid}-reset-email`}
                    name="email" type="email" label="Email"
                    autoComplete="email"
                    value={email} onChange={setEmail} autoFocus
                    errorId={resetErrId}
                  />

                  {resetState.error && (
                    <p id={resetErrId} role="alert" className="text-xs text-red-600 rounded-lg px-3 py-2 bg-red-50 border border-red-200">
                      {resetState.error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetPending}
                    className="w-full mt-1 h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ background: BG, outlineColor: BG }}
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
                  <svg className="w-7 h-7" aria-hidden style={{ color: BG }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h1 className="text-lg font-bold text-slate-900 mb-2 font-display">Email enviado</h1>
                <p className="text-slate-500 text-sm mb-6">
                  Verifique <span className="text-slate-900 font-semibold">{email}</span> e clique no link.
                </p>
                <button
                  onClick={() => setMode('login')}
                  className="text-xs font-semibold cursor-pointer hover:opacity-75 transition-opacity focus-visible:underline"
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
