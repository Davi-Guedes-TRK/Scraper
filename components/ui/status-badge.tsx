import type { ReactNode } from 'react'

export function Pill({ color, children, dot = true }: { color: string; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono whitespace-nowrap"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />}
      {children}
    </span>
  )
}

const TRIAGEM: Record<string, { label: string; color: string }> = {
  pendente:     { label: 'Pendente',    color: '#c08a3e' },
  para_visitar: { label: 'Para visitar', color: '#5b7a99' },
  aprovado:     { label: 'Aprovado',    color: '#5d7a43' },
  descartado:   { label: 'Descartado',  color: '#897866' },
}

const SOLICITACAO: Record<string, { label: string; color: string }> = {
  enviado:  { label: 'No cartório', color: '#6e4d34' },
  recebido: { label: 'Recebido',    color: '#5d7a43' },
}

export function StatusBadge({ status, kind = 'triagem' }: { status?: string | null; kind?: 'triagem' | 'solicitacao' }) {
  const map = kind === 'solicitacao' ? SOLICITACAO : TRIAGEM
  const meta = status ? map[status] : undefined
  if (!meta) return <span className="text-muted-foreground/60 text-xs font-mono">—</span>
  return <Pill color={meta.color}>{meta.label}</Pill>
}

export function AnuncianteBadge({ tipo }: { tipo: 'proprietario' | 'corretor' | 'indefinido' }) {
  if (tipo === 'proprietario') return <Pill color="#5d7a43">PF · Proprietário</Pill>
  if (tipo === 'corretor') return <Pill color="#897866" dot={false}>Corretor</Pill>
  return <span className="text-muted-foreground/60 text-xs font-mono">—</span>
}
