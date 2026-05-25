export const PORTALS: Record<string, { label: string; badge: string; hex: string }> = {
  dfimoveis: { label: 'DFImóveis', badge: 'blue',   hex: '#2563eb' },
  olx:       { label: 'OLX',       badge: 'orange', hex: '#f97316' },
  wimoveis:  { label: 'WImóveis',  badge: 'cyan',   hex: '#0891b2' },
  facebook:  { label: 'Facebook',  badge: 'indigo', hex: '#4f46e5' },
}

export const portalKeys = Object.keys(PORTALS)
export const portalLabel = (portal: string) => PORTALS[portal]?.label ?? portal
export const portalTable = (portal: string) => `imoveis_${portal}`
