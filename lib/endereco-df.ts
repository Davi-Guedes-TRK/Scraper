// Parser do "começo de endereço" que vem no próprio anúncio (bairro/título do
// DFImóveis/Chaves) → extrai quadra/conjunto/lote pra consultar o cadastro IDE-DF.
// Focado em CASA/LOTE (QI/QL/QR/QS/QN/QNM/QNN/QE...), que é onde o WFS tem cobertura.
// Setor comercial/superquadra (SCS/SHCGN/CLN) cai fora de propósito (cadastro não cobre).

export type EnderecoDF = { quadra?: string; conjunto?: string; casa_lote?: string }

export function parseEnderecoDF(texto: string | null | undefined): EnderecoDF {
  if (!texto) return {}
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

  // SÓ quadra de casa/lote: família Q (QI/QL/QR/QS/QN/QNM/QNN/QE + número).
  // Superquadras (SQN/SQS/SQNW) e setores comerciais (SCS/SHCGN/CLN) NÃO casam aqui
  // de propósito — são apartamento/comercial, onde o lote do cadastro é o prédio
  // inteiro, não a unidade. \bQ nem encosta no Q do meio de "SQNW".
  const qRes = t.match(/\b(Q[A-Z]{0,3})\s*0*(\d{1,4})\b/)
  const quadra = qRes ? `${qRes[1]} ${parseInt(qRes[2], 10)}` : undefined

  const cj = t.match(/(?:CONJUNTO|CONJ|CJ|BLOCO|BL)\s*([A-Z0-9]{1,3})\b/)
  const lt = t.match(/(?:LOTE|LT|CASA)\s*([0-9]+[A-Z]?)\b/)

  return { quadra, conjunto: cj?.[1], casa_lote: lt?.[1] }
}

// Candidato de LOTE só faz sentido para casa/lote/terreno — não para apartamento,
// sala, kitnet etc. (nesses, o lote do cadastro é o prédio inteiro, não a unidade).
export function ehCasaLote(tipoImovel: string | null | undefined): boolean {
  if (!tipoImovel) return false
  const t = tipoImovel.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /(casa|lote|terreno|sitio|chacara|rural)/.test(t)
}
