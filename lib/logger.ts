import sql from '@/lib/db'

export type LogNivel = 'info' | 'warn' | 'error'
export type LogOrigem =
  | 'scraper-ingest'
  | 'processar-pistas'
  | 'extrair-pistas'
  | 'geocodificar'
  | 'triagem'
  | 'visitas'
  | 'relatorio'
  | 'cartorio-inbound'
  | 'cartorio-email'
  | 'cartorio-auto'
  | 'gchat'
  | 'gemini'
  | 'redis'
  | 'sistema'

export async function log(
  nivel: LogNivel,
  origem: LogOrigem,
  mensagem: string,
  detalhe?: unknown,
  duracaoMs?: number,
) {
  try {
    await sql`
      INSERT INTO app_logs (nivel, origem, mensagem, detalhe, duracao_ms)
      VALUES (
        ${nivel},
        ${origem},
        ${mensagem},
        ${detalhe != null ? JSON.stringify(detalhe) : null},
        ${duracaoMs ?? null}
      )
    `
  } catch {
    console.error('[logger falhou]', nivel, origem, mensagem)
  }
}

export function cronometro() {
  const inicio = Date.now()
  return () => Date.now() - inicio
}
