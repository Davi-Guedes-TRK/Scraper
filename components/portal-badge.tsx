const STYLES: Record<string, string> = {
  dfimoveis: 'bg-blue-100 text-blue-700',
  olx:       'bg-orange-100 text-orange-700',
  wimoveis:  'bg-cyan-100 text-cyan-700',
  facebook:  'bg-indigo-100 text-indigo-700',
}

const LABELS: Record<string, string> = {
  dfimoveis: 'DFImóveis',
  olx:       'OLX',
  wimoveis:  'WImóveis',
  facebook:  'Facebook',
}

export function PortalBadge({ portal }: { portal: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STYLES[portal] ?? 'bg-slate-100 text-slate-700'}`}>
      {LABELS[portal] ?? portal}
    </span>
  )
}
