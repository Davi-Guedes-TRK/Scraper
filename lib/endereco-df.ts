// Parser do "começo de endereço" que vem no próprio anúncio (bairro/título do
// DFImóveis/Chaves) → extrai quadra/conjunto/lote pra consultar o cadastro IDE-DF.
// Focado em CASA/LOTE (QI/QL/QR/QS/QN/QNM/QNN/QE...), que é onde o WFS tem cobertura.
// Setor comercial/superquadra (SCS/SHCGN/CLN) cai fora de propósito (cadastro não cobre).

export type EnderecoDF = { quadra?: string; conjunto?: string; casa_lote?: string }

export function parseEnderecoDF(texto: string | null | undefined): EnderecoDF {
  if (!texto) return {}
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

  let quadra: string | undefined
  // 1) quadra residencial: Q + 0-3 letras + número (QI 27, QR 516, QNM 10, QNN 24…)
  const qRes = t.match(/\b(Q[A-Z]{0,3})\s*0*(\d{1,4})\b/)
  if (qRes) {
    quadra = `${qRes[1]} ${parseInt(qRes[2], 10)}`
  } else {
    // 2) outros setores: sigla 2-5 letras (não palavra-ruído) + número (CRNW 510, SQSW 105)
    const m = t.match(/\b(?!QUADRA|BLOCO|CONJ|LOTE|CASA)([A-Z]{2,5})\s*0*(\d{1,4})\b/)
    if (m) quadra = `${m[1]} ${parseInt(m[2], 10)}`
  }

  const cj = t.match(/(?:CONJUNTO|CONJ|CJ|BLOCO|BL)\s*([A-Z0-9]{1,3})\b/)
  const lt = t.match(/(?:LOTE|LT|CASA)\s*([0-9]+[A-Z]?)\b/)

  return { quadra, conjunto: cj?.[1], casa_lote: lt?.[1] }
}
