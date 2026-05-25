'use client'

import { useActionState, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { signIn, resetPassword } from '@/app/actions/auth'
import { LogoMark, APP_NAME } from '@/components/logo'

type Mode = 'login' | 'forgot' | 'forgot_sent'

const initialLogin = { error: null }
const initialReset = { error: null, sent: false }

function FloatingInput({
  name, type = 'text', label, value, onChange, autoFocus,
}: {
  name: string; type?: string; label: string
  value?: string; onChange?: (v: string) => void; autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const hasValue = !!value

  return (
    <div className="relative">
      <input
        name={name}
        type={type}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=" "
        className="peer w-full pt-5 pb-2 px-3.5 rounded-lg text-sm text-foreground outline-none transition-all duration-200 bg-background"
        style={{
          border: `1.5px solid ${focused ? 'var(--primary)' : 'var(--border)'}`,
          boxShadow: focused ? '0 0 0 3px var(--ring)' : 'none',
        }}
      />
      <label
        className="absolute left-3.5 pointer-events-none transition-all duration-200"
        style={{
          top: focused || hasValue ? '7px' : '50%',
          transform: focused || hasValue ? 'translateY(0)' : 'translateY(-50%)',
          fontSize: focused || hasValue ? '10px' : '14px',
          color: focused ? 'var(--primary)' : 'var(--muted-foreground)',
          fontWeight: focused || hasValue ? 600 : 400,
          letterSpacing: focused || hasValue ? '0.04em' : '0',
          textTransform: focused || hasValue ? 'uppercase' : 'none',
        }}
      >
        {label}
      </label>
    </div>
  )
}

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialLogin)
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, initialReset)

  if (resetState.sent && mode !== 'forgot_sent') setMode('forgot_sent')

  return (
    <div className="min-h-screen flex items-center justify-center p-4 page-bg">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {/* Marca */}
        <div className="flex flex-col items-center mb-7">
          <motion.div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-primary-foreground"
            style={{ background: 'var(--primary)', boxShadow: '0 8px 24px rgba(110,77,52,0.3)' }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.34, 1.4, 0.5, 1] }}
          >
            <LogoMark size={24} />
          </motion.div>
          <h1 className="font-display text-xl font-extrabold text-foreground mt-4 tracking-tight">{APP_NAME}</h1>
          <p className="eyebrow text-muted-foreground mt-1">Painel de Captação</p>
        </div>

        {/* Card */}
        <div className="card rounded-2xl p-7">
          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <h2 className="text-lg font-bold text-foreground mb-1 font-display">Bem-vindo de volta</h2>
                <p className="text-muted-foreground text-sm mb-6">Acesse sua conta para continuar.</p>

                <form action={loginAction} className="flex flex-col gap-3">
                  <FloatingInput name="email" type="email" label="Email" value={email} onChange={setEmail} autoFocus />
                  <FloatingInput name="password" type="password" label="Senha" />

                  <AnimatePresence>
                    {loginState.error && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-destructive rounded-lg px-3 py-2"
                        style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)' }}
                      >
                        {loginState.error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loginPending}
                    className="btn-primary w-full mt-1 h-11 rounded-lg text-sm font-bold cursor-pointer"
                  >
                    {loginPending
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                          Entrando…
                        </span>
                      : 'Entrar'}
                  </button>
                </form>

                <button
                  onClick={() => setMode('forgot')}
                  className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer font-medium"
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
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors cursor-pointer font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Voltar
                </button>

                <h2 className="text-lg font-bold text-foreground mb-1 font-display">Redefinir senha</h2>
                <p className="text-muted-foreground text-sm mb-6">Enviaremos um link ao seu email.</p>

                <form action={resetAction} className="flex flex-col gap-3">
                  <FloatingInput name="email" type="email" label="Email" value={email} onChange={setEmail} autoFocus />

                  {resetState.error && (
                    <p className="text-xs text-destructive rounded-lg px-3 py-2"
                       style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)' }}>
                      {resetState.error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetPending}
                    className="btn-primary w-full mt-1 h-11 rounded-lg text-sm font-bold cursor-pointer"
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
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary" style={{ background: 'var(--accent)' }}>
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-foreground mb-2 font-display">Email enviado</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Verifique <span className="text-foreground font-semibold">{email}</span> e clique no link.
                </p>
                <button
                  onClick={() => setMode('login')}
                  className="text-xs text-primary hover:underline cursor-pointer font-semibold"
                >
                  Voltar para o login
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center eyebrow text-muted-foreground/70 text-[9px] mt-6">
          TRK Imóveis · Lago Sul · Brasília
        </p>
      </motion.div>
    </div>
  )
}
