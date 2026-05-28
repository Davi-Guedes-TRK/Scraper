export const parsePreco = (preco: string | null | undefined) =>
  parseInt((preco ?? '').replace(/\D/g, '')) || 0

export const fmtBRL = (n: number) =>
  n ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n) : '—'

export const timeAgo = (ts: string | null | undefined) => {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'ontem' : `${d}d atrás`
}

export const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const allImgs = (imagens: string | null | undefined): string[] => {
  if (!imagens) return []
  return imagens.split(',').map(s => {
    const src = s.trim()
    if (!src) return null
    if (src.startsWith('http')) return src
    return `/fotos/${src.replace(/^imagens\//, '')}`
  }).filter((s): s is string => !!s)
}

export function parseLatLng(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null
  let m = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  m = url.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  return null
}

export function dedupKey(item: { preco?: string | null; area_m2?: string | number | null; bairro?: string | null; cidade?: string | null }): string | null {
  const preco = parsePreco(item.preco)
  const area = String(item.area_m2 ?? '').replace(/\D/g, '')
  const bairro = String(item.bairro ?? item.cidade ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!preco || !bairro) return null
  return `${preco}|${area}|${bairro}`
}

const RE_CORRETOR = /imobili[áa]ria|corretor|\bcreci\b|im[óo]veis ltda|consultoria imob|\bimob\b/i
const RE_PROPRIETARIO = /propriet[áa]rio|direto com (o )?dono|sem corretagem|sem corretor|dono vende|\bparticular\b/i

export function classifyAnunciante(item: {
  creci?: string | null
  tipo_anunciante?: string | null
  nome_anunciante?: string | null
  titulo?: string | null
  descricao?: string | null
}): 'proprietario' | 'corretor' | 'indefinido' {
  if (item.creci?.trim()) return 'corretor'
  const ta = (item.tipo_anunciante ?? '').toLowerCase()
  if (ta === 'pj') return 'corretor'
  if (['particular', 'proprietario', 'proprietário', 'pf', 'pessoa fisica', 'pessoa física'].includes(ta)) return 'proprietario'
  const txt = `${item.nome_anunciante ?? ''} ${item.titulo ?? ''} ${item.descricao ?? ''}`
  if (RE_PROPRIETARIO.test(txt)) return 'proprietario'
  if (RE_CORRETOR.test(txt)) return 'corretor'
  return 'indefinido'
}
