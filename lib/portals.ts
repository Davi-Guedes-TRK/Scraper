export const PORTALS: Record<string, { label: string; badge: string; hex: string }> = {
  dfimoveis:   { label: 'DFImóveis', badge: 'blue',    hex: '#2563eb' },
  olx:         { label: 'OLX',       badge: 'orange',  hex: '#f97316' },
  wimoveis:    { label: 'WImóveis',  badge: 'cyan',    hex: '#0891b2' },
  facebook:    { label: 'Facebook',  badge: 'indigo',  hex: '#4f46e5' },
  vivareal:    { label: 'Viva Real', badge: 'pink',    hex: '#ec4899' },
  zap:         { label: 'ZAP',       badge: 'violet',  hex: '#7c3aed' },
  chavesnamao: { label: 'Chaves',    badge: 'emerald', hex: '#059669' },
}

export const portalKeys = Object.keys(PORTALS)
export const portalLabel = (portal: string) => PORTALS[portal]?.label ?? portal
export const portalTable = (portal: string) => `imoveis_${portal}`

export const LANCAMENTO_FONTES: Record<string, { label: string; hex: string }> = {
  lotus:          { label: 'Lotus Cidade',    hex: '#0891b2' },
  paulo_octavio:  { label: 'Paulo Octávio',   hex: '#2563eb' },
  riva:           { label: 'Riva',            hex: '#f59e0b' },
  direcional:     { label: 'Direcional',      hex: '#dc2626' },
  greenhouse:     { label: 'GreenHouse',      hex: '#16a34a' },
  elar:           { label: 'Elar',            hex: '#7c3aed' },
}

export const lancamentoFontes = Object.keys(LANCAMENTO_FONTES)
export const lancamentoLabel = (fonte: string) => LANCAMENTO_FONTES[fonte]?.label ?? fonte
