// Mapeamento região (RA/bairro) → ofício de Registro de Imóveis do DF.
// Fonte: oficios.txt (Davi). Edite aqui para atualizar ofícios/contatos/regiões.
// Usado em "Meu Cartório" para organizar o envio de matrículas (certidão de ônus).

export type Canal = 'whatsapp' | 'email' | 'telefone'

export type Oficio = {
  nome: string
  canal: Canal
  contato: string
  regioes: string[]
}

export const OFICIOS: Oficio[] = [
  {
    nome: '1º Ofício', canal: 'whatsapp', contato: '+55 61 2102-2102',
    regioes: ['Asa Sul', 'Lago Sul', 'Sudoeste', 'Cruzeiro', 'Octogonal', 'Setor Gráfico Sul'],
  },
  {
    nome: '2º Ofício', canal: 'email', contato: 'certidao.onus@2ridf.com.br',
    regioes: ['Asa Norte', 'Paranoá', 'Jardim Botânico', 'Lago Norte', 'SOF Norte'],
  },
  {
    nome: '3º Ofício', canal: 'telefone', contato: '61 3563-3200',
    regioes: ['Taguatinga', 'Águas Claras', 'Samambaia', 'Recanto das Emas'],
  },
  {
    nome: '4º Ofício', canal: 'telefone', contato: '5561910184400',
    regioes: ['Guará', 'Núcleo Bandeirante', 'Candangolândia', 'Riacho Fundo', 'Setor de Indústria', 'SMPW', 'Park Way', 'Park Sul'],
  },
]

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const INDEX: { key: string; oficio: Oficio }[] = OFICIOS.flatMap(o => o.regioes.map(r => ({ key: norm(r), oficio: o })))

/** Resolve o ofício a partir da região/bairro (tolerante a acento, caixa, hífen). */
export function oficioFor(regiao: string | null | undefined): Oficio | null {
  if (!regiao) return null
  const q = norm(regiao)
  if (!q) return null
  for (const { key, oficio } of INDEX) {
    if (q === key || q.includes(key) || key.includes(q)) return oficio
  }
  return null
}

/** Link de envio pronto (wa.me / mailto / tel) com a lista de matrículas no corpo. */
export function envioLink(oficio: Oficio, matriculas: string[]): string | null {
  const lista = matriculas.filter(Boolean)
  const corpo = `Olá! Gostaria de solicitar a certidão de ônus das seguintes matrículas: ${lista.join(', ')}. Obrigado — TRK Imóveis.`
  if (oficio.canal === 'whatsapp') {
    const d = oficio.contato.replace(/\D/g, '')
    return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}?text=${encodeURIComponent(corpo)}`
  }
  if (oficio.canal === 'email') {
    return `mailto:${oficio.contato}?subject=${encodeURIComponent('Solicitação de certidão de ônus — TRK Imóveis')}&body=${encodeURIComponent(corpo)}`
  }
  return `tel:${oficio.contato.replace(/[^\d+]/g, '')}`
}

const REGIOES_CANON = OFICIOS.flatMap(o => o.regioes.map(r => ({ canon: r, key: norm(r) })))

/** Acha uma região conhecida dentro de um texto de endereço (ex.: do geocode). */
export function detectRegiao(texto: string | null | undefined): string | null {
  if (!texto) return null
  const q = norm(texto)
  for (const { canon, key } of REGIOES_CANON) if (q.includes(key)) return canon
  return null
}
