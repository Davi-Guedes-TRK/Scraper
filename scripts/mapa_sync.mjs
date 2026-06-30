// Mapa Estratégico — sync on-prem (contrato do /api/mapa existente).
// Popula mapa_demanda{bairro,lat,lng,peso} + mapa_ativos (geocodificado). Pipe é derivado
// live na API (pipefy_captacoes ⋈ mapa_demanda pelo bairro), então só garantimos que os
// bairros do pipe existam em mapa_demanda (peso 0) p/ herdarem o centroide.
// Roda ON-PREM (a Vercel não alcança o dw_trk). Geocode: coords do Nido > cache > Nominatim > centroide.
//
// Uso: node scripts/mapa_sync.mjs            (incremental — usa cache de geocode em mapa_ativos)
//      node scripts/mapa_sync.mjs --regeo    (força re-geocodificar)
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { centroideDe, DF_CENTRO } from '../lib/df-regioes.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
function envGet(key) {
  if (process.env[key]) return process.env[key]
  for (const p of [resolve(HERE, '../.env.local'), resolve(HERE, '../../.env')]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(new RegExp('^' + key + '=(.+)$', 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}
const DW = envGet('DW_DATABASE_URL'); const SB = envGet('DATABASE_URL')
if (!DW || !SB) { console.error('Falta DW_DATABASE_URL ou DATABASE_URL'); process.exit(1) }
const REGEO = process.argv.includes('--regeo')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const up = (s) => (s ?? '').toString().trim().toUpperCase()
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }
const classe = (t) => { const s = (t || '').toUpperCase()
  if (/SALA|LOJA|COMERCIAL|GALP|PR[ÉE]DIO|ANDAR|LAJE|PONTO|ESCANINHO|POUSADA/.test(s)) return 'Comercial'
  if (/TERRENO|LOTE|CH[ÁA]CARA|CHACARA|FAZENDA|S[ÍI]TIO|[ÁA]REA/.test(s)) return 'Terreno/Rural'
  if (/APART|CASA|KIT|FLAT|COBERT|RESID|DUPLEX|SOBRADO|LOFT|VILA/.test(s)) return 'Residencial'
  return 'Outro' }
// Jitter gaussiano (Box-Muller, clamp ±2.5σ) → nuvem de pontos com densidade radial natural
// em torno do centroide (heat orgânico), em vez de uma caixa uniforme.
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random()
  return Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))) }

let geoCalls = 0
async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&bounded=1` +
    `&viewbox=-48.35,-15.45,-47.30,-16.15&q=${encodeURIComponent(q)}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'TRK-ERP-mapa/1.0 (d.guedes@trkimoveis.com.br)' }, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return null
    const d = await r.json()
    if (!Array.isArray(d) || !d.length) return null
    const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
  } catch { return null }
}
async function resolverGeo({ nidoLat, nidoLng, endereco, bairro }, prev) {
  if (nidoLat && nidoLng && Number(nidoLat) !== 0 && Number(nidoLng) !== 0)
    return { lat: Number(nidoLat), lng: Number(nidoLng), geo_fonte: 'coords' }
  if (!REGEO && prev && prev.endereco === endereco && prev.lat != null)
    return { lat: prev.lat, lng: prev.lng, geo_fonte: prev.geo_fonte }
  if (endereco) {
    const g = await nominatim(`${endereco}, ${bairro || ''}, Brasília, Distrito Federal, Brasil`)
    geoCalls++; await sleep(1100)
    if (g) return { lat: g[0], lng: g[1], geo_fonte: 'nominatim' }
  }
  const c = centroideDe(bairro)
  return c ? { lat: c[0], lng: c[1], geo_fonte: 'centroide' } : { lat: DF_CENTRO[0], lng: DF_CENTRO[1], geo_fonte: 'centroide' }
}

const dw = postgres(DW, { max: 1, connect_timeout: 15 })
const sb = postgres(SB, { ssl: 'require', max: 1, idle_timeout: 30 })

try {
  // mapa_demanda pode existir com schema antigo (regiao_key) → recria no schema certo.
  await sb`DROP TABLE IF EXISTS public.mapa_demanda`
  await sb.unsafe(readFileSync(resolve(HERE, 'sql/create_mapa.sql'), 'utf8'))
  // mapa_ativos pode pré-existir (trabalho paralelo) com schema enxuto → adiciona colunas
  // que faltam (aditivo, não dropa nem quebra a API deles) + garante chave p/ upsert.
  await sb`ALTER TABLE public.mapa_ativos ADD COLUMN IF NOT EXISTS disponivel_venda boolean`
  await sb`ALTER TABLE public.mapa_ativos ADD COLUMN IF NOT EXISTS disponivel_locacao boolean`
  await sb`ALTER TABLE public.mapa_ativos ADD COLUMN IF NOT EXISTS endereco text`
  await sb`ALTER TABLE public.mapa_ativos ADD COLUMN IF NOT EXISTS geo_fonte text`
  await sb`ALTER TABLE public.mapa_ativos ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz DEFAULT now()`
  await sb`CREATE UNIQUE INDEX IF NOT EXISTS mapa_ativos_codigo_uk ON public.mapa_ativos (codigo_imovel)`
  await sb`ALTER TABLE public.mapa_atendimentos ADD COLUMN IF NOT EXISTS data_cadastro timestamptz`

  // Ponte: reaproveita geocode de uma run anterior (mapa_imoveis) p/ não re-geocodificar.
  const temImoveis = await sb`SELECT to_regclass('public.mapa_imoveis') t`
  if (temImoveis[0]?.t) {
    await sb`INSERT INTO public.mapa_ativos (codigo_imovel, bairro, tipo_imovel, preco, disponivel_venda, disponivel_locacao, endereco, lat, lng, geo_fonte)
             SELECT codigo, bairro, tipo_imovel, valor, disponivel_venda, disponivel_locacao, endereco, lat, lng, geo_fonte
             FROM public.mapa_imoveis WHERE fonte = 'ativo' ON CONFLICT (codigo_imovel) DO NOTHING`
    console.log('cache: coords reaproveitadas de mapa_imoveis')
  }

  // cache de geocode atual
  const prevRows = await sb`SELECT codigo_imovel, endereco, lat, lng, geo_fonte FROM public.mapa_ativos`
  const prev = new Map(prevRows.map(r => [r.codigo_imovel, r]))

  // ── DEMANDA: atendimentos em aberto por bairro (UPPER) ──
  const atend = await dw`
    SELECT upper(btrim(COALESCE(NULLIF(btrim(bairro_interesse), ''), regiao_interesse))) bairro, count(*) n
    FROM nido_atendimentos
    WHERE situacao = 'Ativo'
      AND COALESCE(NULLIF(btrim(bairro_interesse), ''), NULLIF(btrim(regiao_interesse), '')) IS NOT NULL
    GROUP BY 1`
  // bairros do pipe (mesmo filtro da API) p/ herdarem centroide no join
  const pipeBairros = await sb`
    SELECT DISTINCT upper(btrim(bairro)) bairro FROM public.pipefy_captacoes
    WHERE NULLIF(btrim(bairro),'') IS NOT NULL AND coalesce(fase_atual,'') NOT IN ('Não Captado','Captado')`

  const demMap = new Map()
  for (const r of atend) { const c = centroideDe(r.bairro); if (c) demMap.set(r.bairro, { lat: c[0], lng: c[1], peso: Number(r.n) }) }
  for (const r of pipeBairros) { if (!demMap.has(r.bairro)) { const c = centroideDe(r.bairro); if (c) demMap.set(r.bairro, { lat: c[0], lng: c[1], peso: 0 }) } }
  const demRows = [...demMap.entries()].map(([bairro, v]) => ({ bairro, lat: v.lat, lng: v.lng, peso: v.peso }))
  if (demRows.length) await sb`INSERT INTO public.mapa_demanda ${sb(demRows, 'bairro', 'lat', 'lng', 'peso')}`
  const pesoTot = demRows.reduce((a, r) => a + r.peso, 0)
  console.log(`demanda: ${demRows.length} regiões (peso total ${pesoTot}; ${demRows.filter(r => r.peso === 0).length} só p/ join do pipe)`)

  // ── ATENDIMENTOS em aberto (grão fino p/ filtros do heat) ──
  const atendRaw = await dw`
    SELECT codigo_atendimento,
           upper(btrim(COALESCE(NULLIF(btrim(bairro_interesse), ''), regiao_interesse))) bairro,
           tipo_negocio, tipo_imovel_buscado, tipo_utilizacao, preco_maximo, data_cadastro
    FROM nido_atendimentos
    WHERE situacao = 'Ativo'
      AND COALESCE(NULLIF(btrim(bairro_interesse), ''), NULLIF(btrim(regiao_interesse), '')) IS NOT NULL`
  const aRows = []
  for (const a of atendRaw) {
    const c = centroideDe(a.bairro); if (!c) continue
    aRows.push({
      codigo_atendimento: String(a.codigo_atendimento), bairro: a.bairro,
      tipo_negocio: a.tipo_negocio || null, tipo_imovel: a.tipo_imovel_buscado || null,
      classe: classe(a.tipo_imovel_buscado), tipo_utilizacao: a.tipo_utilizacao || null,
      preco_max: num(a.preco_maximo), data_cadastro: a.data_cadastro || null,
      lat: c[0] + gauss() * 0.006, lng: c[1] + gauss() * 0.006,
    })
  }
  await sb`DELETE FROM public.mapa_atendimentos`
  const AC = ['codigo_atendimento', 'bairro', 'tipo_negocio', 'tipo_imovel', 'classe', 'tipo_utilizacao', 'preco_max', 'data_cadastro', 'lat', 'lng']
  for (let i = 0; i < aRows.length; i += 200) { const lote = aRows.slice(i, i + 200); if (lote.length) await sb`INSERT INTO public.mapa_atendimentos ${sb(lote, ...AC)}` }
  console.log(`atendimentos: ${aRows.length} (grão fino p/ filtros do heat)`)

  // ── ATIVOS (nido) → geocode → mapa_ativos ──
  const ativos = await dw`
    SELECT codigo_imovel, tipo_imovel, bairro, logradouro, numero, complemento, bloco,
           latitude, longitude, disponivel_venda, disponivel_locacao, preco_venda, preco_locacao
    FROM nido_imoveis WHERE situacao = 'Ativo'`
  const rows = []
  for (const i of ativos) {
    const endereco = [i.logradouro, i.numero && Number(i.numero) > 0 ? i.numero : null, i.complemento,
      i.bloco && String(i.bloco).trim() !== '0' ? 'Bloco ' + i.bloco : null].filter(Boolean).join(', ')
    const g = await resolverGeo({ nidoLat: i.latitude, nidoLng: i.longitude, endereco, bairro: i.bairro }, prev.get(i.codigo_imovel))
    rows.push({ codigo_imovel: i.codigo_imovel, bairro: i.bairro, tipo_imovel: i.tipo_imovel,
      preco: num(i.preco_venda) ?? num(i.preco_locacao), disponivel_venda: !!i.disponivel_venda,
      disponivel_locacao: !!i.disponivel_locacao, endereco, lat: g.lat, lng: g.lng, geo_fonte: g.geo_fonte })
  }
  const COLS = ['codigo_imovel', 'bairro', 'tipo_imovel', 'preco', 'disponivel_venda', 'disponivel_locacao', 'endereco', 'lat', 'lng', 'geo_fonte']
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200)
    await sb`INSERT INTO public.mapa_ativos ${sb(lote, ...COLS)}
      ON CONFLICT (codigo_imovel) DO UPDATE SET
        ${sb.unsafe(COLS.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(', '))}, sincronizado_em = now()`
  }
  const geo = await sb`SELECT geo_fonte, count(*) n FROM public.mapa_ativos GROUP BY 1 ORDER BY 2 DESC`
  console.log(`ativos: ${rows.length} (${geo.map(r => `${r.geo_fonte}:${r.n}`).join(', ')})`)

  // limpeza da tabela divergente da 1ª tentativa
  await sb`DROP TABLE IF EXISTS public.mapa_imoveis`
  console.log(`\nChamadas Nominatim nesta run: ${geoCalls}. Pronto.`)
} catch (e) {
  console.error('FALHA:', e.message)
  process.exit(1)
} finally {
  await dw.end(); await sb.end()
}
