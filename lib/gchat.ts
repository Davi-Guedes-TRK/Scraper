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
