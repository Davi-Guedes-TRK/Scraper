import { log } from '@/lib/logger'

// Notifica um espaço do Google Chat via webhook (GCHAT_WEBHOOK_URL).
// Enquanto o webhook não existe, vira no-op logado — não quebra o fluxo.
export async function notifyGChat(text: string): Promise<void> {
  const url = process.env.GCHAT_WEBHOOK_URL
  if (!url) {
    await log('info', 'gchat', '(sem GCHAT_WEBHOOK_URL) ' + text).catch(() => {})
    return
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    await log('warn', 'gchat', 'falha ao notificar', { error: err instanceof Error ? err.message : String(err) }).catch(() => {})
  }
}

// Mensagens padronizadas do fluxo de cartório
export const cartorioMsg = {
  matriculaRecebida: (endereco: string, matricula: string, metodo: 'ref' | 'fuzzy') =>
    `✅ *Matrícula recebida* (${metodo})\n${endereco} → mat. ${matricula}`,

  cardCriado: (endereco: string, matricula: string, url: string) =>
    `📋 *Card criado* em COM-Oportunidades\n*${endereco}* — mat. ${matricula}\n${url}`,

  cardExistente: (endereco: string) =>
    `ℹ️ Card já existe — pulado: ${endereco}`,

  erroCard: (endereco: string, erro: string) =>
    `⚠️ *Falha ao criar card*\n${endereco}\n\`${erro}\``,

  emailEnviado: (n: number, oficio: string) =>
    `📧 *${n} solicitação${n > 1 ? 'ões' : ''} enviada${n > 1 ? 's' : ''}* ao ${oficio}`,
}
