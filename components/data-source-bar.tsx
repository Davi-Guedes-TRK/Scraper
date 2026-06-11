'use client'

import { usePathname } from 'next/navigation'

// Proveniência dos dados por página: de onde vem (tabela/portal/sistema) e o ano/recência.
// Casado por prefixo de rota — os mais específicos primeiro (funil-inquilinos antes de funil).
type Src = { match: string; fonte: string; ano: string; wip?: boolean }

const SOURCES: Src[] = [
  { match: '/analitico/funil-inquilinos', fonte: 'Nido (dw_trk) · nido_atendimentos (locação) → funil_inquilinos', ano: '2009–2026 · snapshot' },
  { match: '/analitico/funil',            fonte: 'Pipefy "COM - Oportunidades" → pipefy_captacoes · anúncios ativos: imoveis_todos', ano: 'pipe atual · portais ao vivo' },
  { match: '/in-loco',                    fonte: 'Captura em campo (leads_in_loco) · endereço via Geoportal-DF', ano: 'ao vivo', wip: true },
  { match: '/carteira-paralela',          fonte: 'Nido (dw_trk) · atendimentos ativos × imóveis disponíveis → carteira_paralela', ano: 'snapshot diário', wip: true },
  { match: '/captacao',                   fonte: 'Nido (dw_trk) · nido_imoveis (Negociado/Inativo) → leads_nao_adm', ano: 'snapshot diário' },
  { match: '/triagem',                    fonte: 'Portais scrapeados — DFImóveis, OLX, ZAP, VivaReal, ChavesNaMão (imoveis_todos)', ano: 'ao vivo' },
  { match: '/relatorio',                  fonte: 'Portais scrapeados + matrículas (imoveis_todos)', ano: 'ao vivo' },
  { match: '/lancamentos',                fonte: 'Empreendimentos de incorporadoras (scraping: Lotus, Direcional, Riva…)', ano: 'ao vivo' },
  { match: '/scrapers',                   fonte: 'Jobs de scraping dos portais', ano: 'ao vivo' },
  { match: '/visitas',                    fonte: 'Imóveis da triagem marcados para visita (Supabase)', ano: 'ao vivo' },
  { match: '/dashboard',                  fonte: 'Agregado — portais (Supabase) + Nido + Pipefy', ano: 'misto' },
]

export function DataSourceBar() {
  const pathname = usePathname()
  const src = SOURCES.find(s => pathname.startsWith(s.match))
  if (!src) return null
  return (
    <div
      className="flex items-center gap-2 px-4 py-1 text-[10px] text-muted-foreground/80 flex-shrink-0 overflow-hidden"
      style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}
    >
      {src.wip && (
        <span className="px-1.5 py-0.5 rounded-full font-semibold text-white shrink-0" style={{ background: 'var(--chart-2)', fontSize: 9 }}>
          🚧 Em desenvolvimento
        </span>
      )}
      <span className="truncate"><span className="font-semibold text-muted-foreground">Fonte:</span> {src.fonte}</span>
      <span className="ml-auto whitespace-nowrap shrink-0"><span className="font-semibold text-muted-foreground">Dados:</span> {src.ano}</span>
    </div>
  )
}
