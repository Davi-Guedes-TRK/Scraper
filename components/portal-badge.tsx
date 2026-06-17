const STYLES: Record<string, string> = {
  dfimoveis: 'bg-blue-100 text-blue-700',
  olx:       'bg-orange-100 text-orange-700',
  vivareal:  'bg-pink-100 text-pink-700',
  zap:       'bg-violet-100 text-violet-700',
}

const LABELS: Record<string, string> = {
  dfimoveis: 'DFImóveis',
  olx:       'OLX',
  vivareal:  'Viva Real',
  zap:       'ZAP',
}

export function PortalBadge({ portal }: { portal: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STYLES[portal] ?? 'bg-slate-100 text-slate-700'}`}>
      {LABELS[portal] ?? portal}
    </span>
  )
}
