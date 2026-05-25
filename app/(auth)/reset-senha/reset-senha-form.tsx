'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/logo'
import { useRouter } from 'next/navigation'

type State = 'loading' | 'form' | 'success' | 'invalid'

export function ResetSenhaForm() {
  const [state, setState] = useState<State>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase PKCE flow: o code vem na query string; o proxy.ts o troca por sessão automaticamente.
    // Só precisamos verificar se há sessão ativa após o redirect.
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? 'form' : 'invalid')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.')
    if (password !== confirm) return setError('As senhas não coincidem.')

    setPending(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (error) return setError('Não foi possível atualizar a senha. Tente solicitar um novo link.')
    setState('success')
    setTimeout(() => router.push('/'), 2000)
  }

  return (
    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo className="text-zinc-900" markClass="w-9 h-9" textClass="text-2xl" />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8">

          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-2 border-slate-200 border-t-trk-blue rounded-full animate-spin" />
            </div>
          )}

          {state === 'invalid' && (
            <div className="text-center py-4">
              <p className="text-slate-600 text-sm mb-4">Link inválido ou expirado.</p>
              <button
                onClick={() => router.push('/login')}
                className="text-sm text-trk-blue hover:underline"
              >
                Voltar para o login
              </button>
            </div>
          )}

          {state === 'form' && (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Nova senha</h1>
              <p className="text-slate-500 text-sm mb-6">Escolha uma senha segura para sua conta.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Nova senha</label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg px-4 py-3 outline-none focus:border-trk-blue placeholder-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Confirmar senha</label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg px-4 py-3 outline-none focus:border-trk-blue placeholder-slate-400 transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full bg-primary hover:bg-primary-h disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {pending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {pending ? 'Salvando…' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}

          {state === 'success' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Senha atualizada</h2>
              <p className="text-slate-500 text-sm">Redirecionando para o painel…</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
