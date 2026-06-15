// Ficha de Risco do imóvel — alerta sobre imóvel problemático (deslizamento,
// inundação, contexto geológico) a partir das cartas do SGB/CPRM. NÃO é score de
// valor; é alarme. Cacheada (Redis, 30d) porque o WFS do SGB oscila e o dado é
// estável. Degradação silenciosa: ponto sem feição = "sem risco mapeado".
import { sgbNoPonto } from './wfs-sgb'
import { withCache } from './redis'

export type GrauRisco = 'Alta' | 'Média' | 'Baixa'
export type RiscoItem = { tipo: string; classe: GrauRisco; fonte: string | null; ano: number | null }
export type Geologia = {
  unidade: string | null
  ambiente_tectonico: string | null
  idade: string | null
  litotipos: string | null
}
export type FichaRisco = {
  riscos: RiscoItem[]
  geologia: Geologia | null
  nivel: 'alto' | 'medio' | 'baixo' | 'nenhum'
  avaliado: boolean   // true = consultamos as cartas (mesmo que 0 riscos)
}

// camada SGB → rótulo humano do processo
const CAMADAS: Array<{ typeName: string; tipo: string }> = [
  { typeName: 'gestao-territorial:suscet_movimento_de_massa', tipo: 'Movimento de massa' },
  { typeName: 'gestao-territorial:suscet_inundacao',           tipo: 'Inundação' },
  { typeName: 'gestao-territorial:suscet_enxurrada',           tipo: 'Enxurrada' },
  { typeName: 'gestao-territorial:suscet_corrida_de_massa',    tipo: 'Corrida de massa' },
]

type PropRisco = { classe?: string; fonte?: string; ano?: number }
type PropGeo = { nome?: string; ambiente_tectonico?: string; idade_min?: string; idade_max?: string; litotipos?: string }

function normGrau(c: string | undefined): GrauRisco | null {
  if (!c) return null
  const s = c.trim().toLowerCase()
  if (s.startsWith('alt')) return 'Alta'
  if (s.startsWith('méd') || s.startsWith('med')) return 'Média'
  if (s.startsWith('baix')) return 'Baixa'
  return null
}

const PESO: Record<GrauRisco, number> = { Baixa: 1, Média: 2, Alta: 3 }

async function consultar(lat: number, lng: number): Promise<FichaRisco> {
  const riscos: RiscoItem[] = []
  // sequencial de propósito: o SGB derruba sob rajada de requisições paralelas
  for (const c of CAMADAS) {
    try {
      const feats = await sgbNoPonto<PropRisco>(c.typeName, lat, lng, ['classe', 'fonte', 'ano'])
      // pior grau entre as feições que cobrem o ponto
      let pior: { classe: GrauRisco; fonte: string | null; ano: number | null } | null = null
      for (const f of feats) {
        const g = normGrau(f.classe)
        if (g && (!pior || PESO[g] > PESO[pior.classe])) {
          pior = { classe: g, fonte: f.fonte ?? null, ano: f.ano ?? null }
        }
      }
      if (pior) riscos.push({ tipo: c.tipo, ...pior })
    } catch { /* camada indisponível → ignora, não inventa */ }
  }

  let geologia: Geologia | null = null
  try {
    const g = (await sgbNoPonto<PropGeo>('geosgb:litoestratigrafia_1m', lat, lng,
      ['nome', 'ambiente_tectonico', 'idade_min', 'idade_max', 'litotipos']))[0]
    if (g) geologia = {
      unidade: g.nome ?? null,
      ambiente_tectonico: g.ambiente_tectonico ?? null,
      idade: [g.idade_min, g.idade_max].filter(Boolean).join('–') || null,
      litotipos: g.litotipos ?? null,
    }
  } catch { /* ignora */ }

  const piorGeral = riscos.reduce((m, r) => Math.max(m, PESO[r.classe]), 0)
  const nivel = piorGeral === 3 ? 'alto' : piorGeral === 2 ? 'medio' : piorGeral === 1 ? 'baixo' : 'nenhum'
  return { riscos, geologia, nivel, avaliado: true }
}

export async function fichaRisco(lat: number, lng: number): Promise<FichaRisco> {
  const key = `ficha-risco:${lat.toFixed(4)}:${lng.toFixed(4)}`
  return withCache(key, 60 * 60 * 24 * 30, () => consultar(lat, lng))
}
