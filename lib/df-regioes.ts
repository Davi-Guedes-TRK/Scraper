// Centroides aproximados das Regiões Administrativas / setores do DF, p/ o Mapa
// Estratégico (heat de demanda por região + fallback de geocodificação de imóvel).
// Coordenadas aproximadas (centro da RA) — suficientes p/ heat regional, NÃO p/ ponto exato.

export const DF_CENTRO: [number, number] = [-15.793, -47.882]

// chave normalizada → [lat, lng]
export const DF_CENTROIDES: Record<string, [number, number]> = {
  asa_norte: [-15.742, -47.879],
  asa_sul: [-15.823, -47.909],
  lago_sul: [-15.842, -47.869],          // SHIS
  lago_norte: [-15.726, -47.833],        // SHIN
  sudoeste: [-15.795, -47.929],
  octogonal: [-15.793, -47.921],
  noroeste: [-15.738, -47.917],
  cruzeiro: [-15.792, -47.931],
  guara: [-15.818, -47.968],
  zona_industrial: [-15.811, -47.958],
  aguas_claras: [-15.840, -48.024],
  areal: [-15.833, -48.018],
  vicente_pires: [-15.802, -48.022],
  taguatinga: [-15.833, -48.058],
  ceilandia: [-15.819, -48.110],
  samambaia: [-15.879, -48.092],
  recanto_das_emas: [-15.905, -48.063],
  riacho_fundo: [-15.884, -48.022],
  riacho_fundo_2: [-15.910, -48.040],
  park_way: [-15.899, -47.959],
  nucleo_bandeirante: [-15.870, -47.969],
  candangolandia: [-15.852, -47.951],
  jardim_botanico: [-15.873, -47.802],   // inclui Setor de Mansões Dom Bosco
  sobradinho: [-15.653, -47.790],
  sobradinho_2: [-15.690, -47.825],
  planaltina: [-15.621, -47.652],
  paranoa: [-15.772, -47.711],
  itapoa: [-15.748, -47.772],
  gama: [-16.013, -48.063],
  santa_maria: [-16.013, -48.018],
  sao_sebastiao: [-15.899, -47.779],
  brazlandia: [-15.668, -48.202],
  cruzeiro_novo: [-15.789, -47.933],
  cruzeiro_velho: [-15.797, -47.927],
  sia: [-15.799, -47.951],
  setor_militar: [-15.768, -47.901],
  varjao: [-15.711, -47.876],
  estrutural: [-15.785, -47.999],
  vila_planalto: [-15.752, -47.806],
}

const ALIASES: [RegExp, string][] = [
  [/HABITA.+INDIVIDUAIS SUL|SHIS|LAGO SUL/i, 'lago_sul'],
  [/HABITA.+INDIVIDUAIS NORTE|SHIN|LAGO NORTE/i, 'lago_norte'],
  [/MANS.+DOM BOSCO|JARDIM BOT/i, 'jardim_botanico'],
  [/ASA NORTE|\bSQN|\bCLN|\bSHCGN|^NORTE$/i, 'asa_norte'],
  [/ASA SUL|\bSQS|\bCLS|\bSHCGS|^SUL$/i, 'asa_sul'],
  [/SUDOESTE/i, 'sudoeste'],
  [/OCTOGONAL/i, 'octogonal'],
  [/NOROESTE/i, 'noroeste'],
  [/CRUZEIRO NOVO/i, 'cruzeiro_novo'],
  [/CRUZEIRO/i, 'cruzeiro'],
  [/GUAR[ÁA]/i, 'guara'],
  [/ZONA INDUSTRIAL|\bSIA\b/i, 'zona_industrial'],
  [/[ÁA]GUAS CLARAS/i, 'aguas_claras'],
  [/AREAL/i, 'areal'],
  [/VICENTE PIRES/i, 'vicente_pires'],
  [/TAGUATINGA/i, 'taguatinga'],
  [/CEIL[ÂA]NDIA/i, 'ceilandia'],
  [/SAMAMBAIA/i, 'samambaia'],
  [/RECANTO/i, 'recanto_das_emas'],
  [/RIACHO FUNDO\s*(2|II)/i, 'riacho_fundo_2'],
  [/RIACHO FUNDO/i, 'riacho_fundo'],
  [/PARK\s*WAY/i, 'park_way'],
  [/N[ÚU]CLEO BANDEIRANTE/i, 'nucleo_bandeirante'],
  [/CANDANGOL/i, 'candangolandia'],
  [/SOBRADINHO\s*(2|II)/i, 'sobradinho_2'],
  [/SOBRADINHO/i, 'sobradinho'],
  [/PLANALTINA/i, 'planaltina'],
  [/PARANO[ÁA]/i, 'paranoa'],
  [/ITAPO[ÃA]/i, 'itapoa'],
  [/SANTA MARIA/i, 'santa_maria'],
  [/GAMA/i, 'gama'],
  [/S[ÃA]O SEBASTI[ÃA]O/i, 'sao_sebastiao'],
  [/BRAZL[ÂA]NDIA/i, 'brazlandia'],
  [/ESTRUTURAL|SCIA/i, 'estrutural'],
  [/VARJ[ÃA]O/i, 'varjao'],
  [/SETOR MILITAR|\bSMU\b|\bSMDB\b/i, 'setor_militar'],
  [/VILA PLANALTO/i, 'vila_planalto'],
]

/** Mapeia um texto de bairro/região do DF p/ uma chave canônica conhecida (ou null). */
export function regiaoKey(texto: string | null | undefined): string | null {
  const s = (texto ?? '').trim()
  if (!s) return null
  for (const [rx, key] of ALIASES) if (rx.test(s)) return key
  return null
}

/** Centroide [lat,lng] da região do texto; null se não reconhecer. */
export function centroideDe(texto: string | null | undefined): [number, number] | null {
  const k = regiaoKey(texto)
  return k ? DF_CENTROIDES[k] ?? null : null
}

/** Rótulo legível da região (Title Case do texto original, ou a chave). */
export function regiaoLabel(texto: string | null | undefined): string {
  const s = (texto ?? '').trim()
  return s ? s.replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'
}
