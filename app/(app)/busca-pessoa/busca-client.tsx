'use client'

import { useState, useRef } from 'react'
import type { CPFResult, CNPJResult, Telefone } from '@/lib/cpf-lookup'

type ResultCPF  = { type: 'cpf';  data: CPFResult  }
type ResultCNPJ = { type: 'cnpj'; data: CNPJResult }
type Result = ResultCPF | ResultCNPJ

function mask(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function TelRow({ t }: { t: Telefone }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="font-mono text-sm text-foreground">{t.numero}</span>
      {t.status && <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${t.status === 'ATIVO' ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>{t.status}</span>}
      {t.tipo && t.tipo !== 'Não informado' && <span className="text-xs text-muted-foreground">{t.tipo}</span>}
      {t.operadora && t.operadora !== 'Não informado' && <span className="text-xs text-muted-foreground">· {t.operadora}</span>}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="w-40 flex-shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-mono">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function CPFCard({ data }: { data: CPFResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/8 bg-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Dados Pessoais</p>
        <Field label="CPF"          value={mask(data.cpf)} />
        <Field label="Nome"         value={data.nome} />
        <Field label="Nascimento"   value={data.dataNascimento} />
        <Field label="Idade"        value={data.idade != null ? `${data.idade} anos` : undefined} />
        <Field label="Renda"        value={data.renda} />
      </div>

      {data.telefones.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-card p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Telefones ({data.telefones.length})</p>
          {data.telefones.map((t, i) => <TelRow key={i} t={t} />)}
        </div>
      )}

      <a href={data.url} target="_blank" rel="noopener noreferrer"
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 block">
        Ver resultado completo →
      </a>
    </div>
  )
}

function CNPJCard({ data }: { data: CNPJResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/8 bg-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Empresa</p>
        <Field label="CNPJ"         value={mask(data.cnpj)} />
        <Field label="Razão Social" value={data.razaoSocial} />
        <Field label="Fantasia"     value={data.nomeFantasia} />
        <Field label="Situação"     value={data.situacao} />
        <Field label="Capital"      value={data.capitalSocial} />
        <Field label="Porte"        value={data.porte} />
        <Field label="Abertura"     value={data.abertura} />
      </div>

      {data.socioAdmin && (
        <div className="rounded-xl border border-white/8 bg-card p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
            {data.socioAdmin.cpf ? 'Sócio-Administrador' : 'Contato da Empresa'}
          </p>
          <Field label="Nome"   value={data.socioAdmin.nome} />
          <Field label="CPF"    value={data.socioAdmin.cpf ? mask(data.socioAdmin.cpf) : undefined} />
          <Field label="Idade"  value={data.socioAdmin.idade != null ? `${data.socioAdmin.idade} anos` : undefined} />
          <Field label="Renda"  value={data.socioAdmin.renda} />
          {data.socioAdmin.telefones.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-[10px] text-muted-foreground mb-2">Telefones</p>
              {data.socioAdmin.telefones.map((t, i) => <TelRow key={i} t={t} />)}
            </div>
          )}
        </div>
      )}

      {data.telefones.length > 0 && !data.socioAdmin?.cpf && (
        <div className="rounded-xl border border-white/8 bg-card p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Telefones da empresa</p>
          {data.telefones.map((t, i) => <TelRow key={i} t={t} />)}
        </div>
      )}

      <a href={data.url} target="_blank" rel="noopener noreferrer"
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 block">
        Ver resultado completo →
      </a>
    </div>
  )
}

export function BuscaPessoaClient() {
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<Result | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  const handleInput = (v: string) => {
    const d = v.replace(/\D/g, '')
    setQuery(mask(d))
    setError(null)
  }

  const search = async () => {
    const digits = query.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Digite um CPF (11 dígitos) ou CNPJ (14 dígitos)')
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/busca-pessoa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: digits }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro na busca')
      setResult(json as Result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const digits = query.replace(/\D/g, '')
  const tipo   = digits.length === 11 ? 'CPF' : digits.length === 14 ? 'CNPJ' : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight mb-1">Busca de Pessoa</h1>
        <p className="text-sm text-muted-foreground">CPF ou CNPJ — telefone, dados e sócios</p>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="CPF ou CNPJ"
            maxLength={18}
            className="w-full h-10 px-3 rounded-lg border border-white/10 bg-card text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--chart-1)] pr-16"
          />
          {tipo && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--chart-1)] uppercase tracking-widest">
              {tipo}
            </span>
          )}
        </div>
        <button
          onClick={search}
          disabled={loading || (!tipo)}
          className="h-10 px-4 rounded-lg text-sm font-semibold bg-[var(--chart-1)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-2 min-w-[90px] justify-center cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Buscando
            </>
          ) : 'Buscar'}
        </button>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground animate-pulse">
          Aguardando resposta do bot (pode levar até 45s)…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-sm px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={search} className="text-xs font-medium underline hover:no-underline cursor-pointer shrink-0">
            Tentar novamente
          </button>
        </div>
      )}

      {result && (
        result.type === 'cpf'
          ? <CPFCard data={result.data} />
          : <CNPJCard data={result.data} />
      )}
    </div>
  )
}
