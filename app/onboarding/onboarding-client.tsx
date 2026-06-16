'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { saveProfile } from '@/app/actions/profile'
import { LogoMark } from '@/components/logo'
import type { Papel } from '@/lib/supabase/profile'

const BG = '#4A235A'
const LIGHT = '#C39BD3'

type Step = 'perfil' | 'tour'

const TOUR_STEPS: Record<Papel, { titulo: string; descricao: string; icon: React.ReactNode }[]> = {
  captador: [
    {
      titulo: 'Suas visitas do dia',
      descricao: 'Em "Visitas" você vê o roteiro organizado por prédio. Funciona no celular — use na rua.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
    },
    {
      titulo: 'Registre em 3 toques',
      descricao: 'No card da visita: toque "Navegar" para ir ao endereço, depois "Registrar" para anotar o resultado.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      titulo: 'In Loco para captações',
      descricao: 'Quando fechar uma captação no local, use "In Loco" para registrar as fotos e dados do imóvel.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <circle cx="12" cy="11" r="2.5" />
        </svg>
      ),
    },
  ],
  operador: [
    {
      titulo: 'Sua fila de triagem',
      descricao: 'Em "Triagem" chegam todos os imóveis dos portais. Revise, enriqueça com o Geoportal e decida: visitar, descartar ou encaminhar ao cartório.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
        </svg>
      ),
    },
    {
      titulo: 'Busca de matrícula',
      descricao: 'No painel de revisão de cada imóvel, você já tem os candidatos do Geoportal. Cole o link do Maps para confirmar o endereço.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l6 3V10m-6 7V4m0 0l6-3" />
          <circle cx="15.5" cy="9.5" r="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      titulo: 'Meu Cartório',
      descricao: 'Processos de cartório ficam em "Cartório" — você vê apenas os seus. Confirme sempre antes de enviar.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ],
  gestor: [
    {
      titulo: 'O funil em 10 segundos',
      descricao: 'O Dashboard mostra o funil de captação com variação semanal. Cada número é clicável e leva à lista correspondente.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      titulo: 'Funil detalhado',
      descricao: 'Em "Funil de Captação" você vê a conversão entre cada etapa e o ranking de captadores.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 8h12M9 12h6M11 16h2M12 20h0" />
        </svg>
      ),
    },
  ],
  admin: [
    {
      titulo: 'Você tem acesso total',
      descricao: 'Como administrador, você vê tudo: triagem, visitas, cartório, scrapers e analítico completo.',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ],
}

function TemaOption({ value, label, selected, onSelect }: {
  value: string; label: string; selected: boolean; onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-150 cursor-pointer"
      style={{
        borderColor: selected ? BG : '#e2e8f0',
        background: selected ? 'rgba(74,35,90,0.06)' : 'white',
      }}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </button>
  )
}

export function OnboardingClient({ papel, nomeInicial }: { papel: Papel; nomeInicial?: string | null }) {
  const [step, setStep] = useState<Step>('perfil')
  const [tourIdx, setTourIdx] = useState(0)
  const [nome, setNome] = useState(nomeInicial ?? '')
  const [tema, setTema] = useState<'light' | 'dark' | 'system'>('system')
  const router = useRouter()
  const [state, action, pending] = useActionState(saveProfile, { error: null })

  const [submitted, setSubmitted] = useState(false)
  const [skipping, setSkipping] = useState(false)

  const tourSlides = TOUR_STEPS[papel] ?? TOUR_STEPS.admin

  // After action completes, check state to advance
  useEffect(() => {
    if (!submitted && !skipping) return
    if (pending) return // still running
    if (!state.error) {
      if (skipping) {
        router.push('/dashboard')
      } else {
        setStep('tour')
      }
    }
    setSubmitted(false)
    setSkipping(false)
  }, [state, pending])

  function handlePerfilSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('nome', nome)
    fd.set('tema', tema)
    setSubmitted(true)
    action(fd)
  }

  function handlePular() {
    // Save profile with onboarding_completo=true before redirecting
    const fd = new FormData()
    fd.set('nome', nome || '')
    fd.set('tema', tema)
    setSkipping(true)
    action(fd)
  }

  function handleProximo() {
    if (tourIdx < tourSlides.length - 1) {
      setTourIdx(i => i + 1)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 gap-6"
      style={{ background: BG }}
    >
      <LogoMark size={40} className="opacity-70 text-[#C39BD3]" />

      <AnimatePresence mode="wait">
        {step === 'perfil' && (
          <motion.div
            key="perfil"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-sm"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-7">
              <h1 className="text-lg font-bold text-slate-900 mb-1 font-display">Bem-vindo ao Velvet</h1>
              <p className="text-slate-500 text-sm mb-6">Como quer ser chamado? Escolha também o tema.</p>

              <form onSubmit={handlePerfilSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nome-field" className="text-xs font-semibold tracking-widest uppercase text-slate-500">
                    Seu nome
                  </label>
                  <input
                    id="nome-field"
                    name="nome"
                    type="text"
                    autoFocus
                    placeholder="Ex.: João Silva"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg text-sm text-slate-900 outline-none bg-slate-50 transition-all duration-150"
                    style={{ border: '1.5px solid #e2e8f0' }}
                    onFocus={e => { e.target.style.borderColor = BG; e.target.style.boxShadow = '0 0 0 3px rgba(74,35,90,0.12)' }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold tracking-widest uppercase text-slate-500">Tema</label>
                  <div className="flex gap-2">
                    <TemaOption value="light" label="Claro" selected={tema === 'light'} onSelect={() => setTema('light')} />
                    <TemaOption value="dark" label="Escuro" selected={tema === 'dark'} onSelect={() => setTema('dark')} />
                    <TemaOption value="system" label="Sistema" selected={tema === 'system'} onSelect={() => setTema('system')} />
                  </div>
                </div>

                {state.error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {state.error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full mt-1 h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: BG }}
                >
                  {pending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {pending ? 'Salvando…' : 'Continuar'}
                </button>
              </form>

              <button
                onClick={handlePular}
                className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-medium"
              >
                Pular e ir direto para o painel
              </button>
            </div>
          </motion.div>
        )}

        {step === 'tour' && (
          <motion.div
            key={`tour-${tourIdx}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full max-w-sm"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-7 text-center">
              <div className="flex gap-1.5 justify-center mb-6">
                {tourSlides.map((_, i) => (
                  <span
                    key={i}
                    className="rounded-full transition-all duration-200"
                    style={{
                      width: i === tourIdx ? 20 : 6,
                      height: 6,
                      background: i === tourIdx ? BG : '#e2e8f0',
                    }}
                  />
                ))}
              </div>

              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(74,35,90,0.08)', color: BG }}
              >
                {tourSlides[tourIdx].icon}
              </div>

              <h2 className="text-base font-bold text-slate-900 mb-2 font-display">
                {tourSlides[tourIdx].titulo}
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                {tourSlides[tourIdx].descricao}
              </p>

              <button
                onClick={handleProximo}
                className="w-full h-11 rounded-lg text-sm font-bold text-white cursor-pointer transition-opacity flex items-center justify-center"
                style={{ background: BG }}
              >
                {tourIdx < tourSlides.length - 1 ? 'Próximo' : 'Começar'}
              </button>

              <button
                onClick={handlePular}
                className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer font-medium"
              >
                Pular tour
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px] font-medium tracking-widest" style={{ color: 'rgba(195,155,211,0.45)' }}>
        © 2026 Velvet
      </p>
    </div>
  )
}
