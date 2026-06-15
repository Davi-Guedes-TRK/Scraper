// Gate de dedup ANTES de gastar ônus (Fase 3). Chamado quando a matrícula chega
// (/api/cartorio/inbound): consulta o espelho do dw_trk e decide o destino:
//   exato    → já é da TRK: avisa, marca o card, NÃO solicita ônus
//   provavel → humano confere (GChat com candidatos)
//   nenhum   → entra na fila do pipefy_portal_fill.py --from-gate (form SEC | Ônus)
import sql from './db'
import { buscarImovelNoDw } from './dw-dedup'
import { atualizarCardOportunidade } from './pipefy'
import { fichaRisco } from './ficha-risco'
import { notifyGChat, cartorioMsg } from './gchat'
import { log } from './logger'

export type GateOnusInput = {
  link: string
  portal: string
  endereco: string
  matricula: string
  bairro?: string | null
  cidade?: string | null
  cardId?: string | null
}

export type GateOnusResult = {
  nivel: 'exato' | 'provavel' | 'nenhum'
  codigos: string[]
  cardId: string | null
}

/** Card do COM-Oportunidades já sincronizado p/ esse anúncio (via pipefy_captacoes). */
export async function cardIdPorLink(link: string): Promise<string | null> {
  const rows = await sql<{ card_id: string }[]>`
    SELECT card_id::text FROM public.pipefy_captacoes
    WHERE links_anuncio ILIKE ${'%' + link + '%'}
    ORDER BY criado_em DESC LIMIT 1`
  return rows[0]?.card_id ?? null
}

/** Risco geológico do imóvel (best-effort) — usa lat/lng do imoveis_todos.
 *  Sinaliza imóvel perigoso ANTES da captação (badge no Pregão). */
async function avaliarRisco(link: string): Promise<{ nivel: string | null; resumo: string | null }> {
  try {
    const rows = await sql<{ lat: number | null; lng: number | null }[]>`
      SELECT lat, lng FROM imoveis_todos WHERE link = ${link} LIMIT 1`
    const { lat, lng } = rows[0] ?? {}
    if (lat == null || lng == null) return { nivel: null, resumo: null }
    const f = await fichaRisco(lat, lng)
    const resumo = f.riscos.map(r => `${r.tipo}: ${r.classe}`).join(' · ') || null
    return { nivel: f.nivel, resumo }
  } catch {
    return { nivel: null, resumo: null }
  }
}

export async function rodarGateOnus(p: GateOnusInput): Promise<GateOnusResult> {
  const dedup = await buscarImovelNoDw(p.endereco)
  const codigos = dedup.matches.map(m => m.codigo_imovel)
  const cardId = p.cardId ?? await cardIdPorLink(p.link).catch(() => null)
  const risco = await avaliarRisco(p.link)

  await sql`
    INSERT INTO onus_pipeline ${sql({
      link: p.link,
      portal: p.portal,
      matricula: p.matricula,
      endereco: p.endereco,
      bairro: p.bairro ?? null,
      cidade: p.cidade ?? null,
      card_id: cardId,
      dedup_nivel: dedup.nivel,
      dedup_codigos: codigos,
      dedup_em: new Date(),
      risco_nivel: risco.nivel,
      risco_resumo: risco.resumo,
    })}
    ON CONFLICT (link) DO UPDATE SET
      matricula = EXCLUDED.matricula,
      card_id = COALESCE(EXCLUDED.card_id, onus_pipeline.card_id),
      dedup_nivel = EXCLUDED.dedup_nivel,
      dedup_codigos = EXCLUDED.dedup_codigos,
      dedup_em = EXCLUDED.dedup_em,
      risco_nivel = COALESCE(EXCLUDED.risco_nivel, onus_pipeline.risco_nivel),
      risco_resumo = COALESCE(EXCLUDED.risco_resumo, onus_pipeline.risco_resumo),
      atualizado_em = now()`

  if (risco.nivel === 'alto') {
    await notifyGChat(`⚠️ *Imóvel com RISCO ALTO* — ${p.endereco}\n${risco.resumo ?? ''}`).catch(() => {})
  }

  // Espelha o resultado no card (best-effort: o gate não pode travar o inbound)
  if (cardId) {
    await atualizarCardOportunidade(cardId, [
      { fieldId: 'tem_cadastro_no_nido', value: dedup.nivel === 'exato' ? 'Sim' : 'Não' },
    ]).catch(err =>
      log('warn', 'onus-gate', 'falha ao atualizar card', {
        cardId, error: err instanceof Error ? err.message : String(err),
      }).catch(() => {}))
  }

  const msg =
    dedup.nivel === 'exato'    ? cartorioMsg.jaNaBase(p.endereco, codigos) :
    dedup.nivel === 'provavel' ? cartorioMsg.dedupProvavel(p.endereco, codigos) :
                                 cartorioMsg.onusLiberada(p.endereco, p.matricula)
  await notifyGChat(msg).catch(() => {})

  return { nivel: dedup.nivel, codigos, cardId }
}
