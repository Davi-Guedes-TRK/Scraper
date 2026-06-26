// Dossiê do proprietário p/ a rodada de escuta da Eduarda (roteiro de conversa).
// Monta a ficha de preparação a partir do dw_trk (Nido). Roda ON-PREM (alcança o DW).
//
// Uso:
//   node scripts/dossie_proprietario.mjs "MARIA SILVA"   busca por nome (lista se ambíguo)
//   node scripts/dossie_proprietario.mjs --codigo 12345   direto pelo codigo_pessoa
//   node scripts/dossie_proprietario.mjs --sample         pega um proprietário de exemplo
//   node scripts/dossie_proprietario.mjs --fila           consome a dossie_fila do Supabase
//                                                          (seleção feita na tela /proprietarios)
//
// Lê DW_DATABASE_URL (DW) e DATABASE_URL (Supabase, só no --fila). Só SELECT no DW.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const HERE = dirname(fileURLToPath(import.meta.url))
function envGet(key) {
  if (process.env[key]) return process.env[key]
  for (const p of [resolve(HERE, '../.env.local'), resolve(HERE, '../../.env'), resolve(HERE, '../.env')]) {
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(new RegExp('^' + key + '=(.+)$', 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const brl = (v) => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const d = (x) => x ? new Date(x).toLocaleDateString('pt-BR') : '—'
const endereco = (r) => [r.logradouro, r.numero && Number(r.numero) > 0 ? r.numero : null, r.complemento,
  r.bloco && String(r.bloco).trim() !== '0' ? 'Bl ' + r.bloco : null, r.unidade ? 'Un ' + r.unidade : null,
  r.bairro, r.cidade].filter(Boolean).join(', ')

function oportunidades(imoveis, fechamentos) {
  const op = []
  if (imoveis.length > 1) op.push(`Possui ${imoveis.length} imóveis no Nido — mapear todos.`)
  for (const i of imoveis) {
    if (i.vago) op.push(`Imóvel ${i.codigo_imovel} consta VAGO → oportunidade de locação/administração.`)
    if (i.disponivel_locacao && i.preco_locacao) op.push(`Imóvel ${i.codigo_imovel} anunciado p/ locação (${brl(i.preco_locacao)}).`)
    if (i.disponivel_venda && i.preco_venda) op.push(`Imóvel ${i.codigo_imovel} anunciado p/ venda (${brl(i.preco_venda)}).`)
  }
  if (!fechamentos.length) op.push('Sem fechamento registrado — relação ainda não convertida.')
  return [...new Set(op)]
}

// Monta o dossiê de um proprietário (codigo_pessoa) a partir do DW. Retorna {md, dados} ou null.
async function montarDossie(dw, cod) {
  const [p] = await dw`SELECT * FROM nido_pessoas WHERE codigo_pessoa = ${cod}`
  if (!p) return null

  const imoveis = await dw`
    SELECT codigo_imovel, tipo_imovel, situacao, situacao_detalhe, logradouro, numero, complemento,
           bloco, unidade, bairro, cidade, preco_locacao, preco_venda, disponivel_locacao,
           disponivel_venda, vago, exclusividade, qtd_dormitorios, area_util, data_atualizacao
    FROM nido_imoveis WHERE codigo_proprietario = ${cod} ORDER BY data_atualizacao DESC NULLS LAST`
  const codes = imoveis.map(i => i.codigo_imovel)

  const profs = codes.length ? await dw`
    SELECT ip.codigo_imovel, ip.relacao, pr.nome_uso, pr.equipe
    FROM nido_imoveis_profissionais ip
    JOIN nido_profissionais pr ON pr.codigo_profissional = ip.codigo_profissional
    WHERE ip.codigo_imovel = ANY(${codes}) AND ip.relacao <> 'FOTOS'
    ORDER BY ip.codigo_imovel, ip.ordem` : []
  const profDe = (ci) => [...new Set(profs.filter(x => x.codigo_imovel === ci).map(x => `${x.nome_uso}${x.equipe ? ' (' + x.equipe + ')' : ''}`))]

  const fech = codes.length ? await dw`
    SELECT codigo_imovel, tipo_negocio, valor_fechamento, data_fechamento, situacao
    FROM nido_fechamentos WHERE codigo_imovel = ANY(${codes}) ORDER BY data_fechamento DESC NULLS LAST` : []

  // PERFIL COMERCIAL: o que o proprietário busca/buscou comprar ou alugar (atendimentos dele).
  const atend = await dw`
    SELECT tipo_negocio, finalidade, tipo_imovel_buscado, preco_minimo, preco_maximo,
           bairro_interesse, regiao_interesse, qtd_minima_dormitorios, andamento, situacao, data_cadastro
    FROM nido_atendimentos WHERE codigo_pessoa = ${cod} ORDER BY data_cadastro DESC LIMIT 8`
  // Propostas ligadas à pessoa (intenção / negociação).
  const props = await dw`
    SELECT tipo_negocio, tipo_proposta, valor_proposto, situacao, motivo_recusa, data_cadastro
    FROM nido_propostas WHERE codigo_pessoa = ${cod} ORDER BY data_cadastro DESC LIMIT 8`

  // Tempo de relação + última interação (varre atendimentos, fechamentos e propostas).
  const datas = [...atend.map(a => a.data_cadastro), ...fech.map(f => f.data_fechamento), ...props.map(x => x.data_cadastro)]
    .filter(Boolean).map(x => new Date(x).getTime()).sort((a, b) => a - b)
  const desde = datas.length ? new Date(datas[0]).getFullYear() : null
  const ultima = datas.length ? new Date(datas[datas.length - 1]) : null
  const idade = p.data_nascimento ? Math.floor((Date.now() - new Date(p.data_nascimento).getTime()) / 31557600000) : null

  const fa = (mn, mx) => { const a = Number(mn) || 0, b = Number(mx) || 0; return (!a && !b) ? '' : (a && b ? `${brl(a)}–${brl(b)}` : brl(a || b)) }
  const atLine = (a) => [a.tipo_negocio, a.tipo_imovel_buscado, fa(a.preco_minimo, a.preco_maximo),
    a.bairro_interesse || a.regiao_interesse, a.qtd_minima_dormitorios ? `${a.qtd_minima_dormitorios}+ dorm` : null,
    a.andamento || a.situacao, d(a.data_cadastro)].filter(Boolean).join(' · ')
  const prLine = (x) => [d(x.data_cadastro), x.tipo_negocio, x.tipo_proposta, brl(x.valor_proposto), x.situacao,
    x.motivo_recusa ? `(${x.motivo_recusa})` : null].filter(Boolean).join(' · ')

  const buscandoAgora = atend.filter(a =>
    /aberto|andamento|ativo|negocia/i.test(`${a.andamento ?? ''} ${a.situacao ?? ''}`) &&
    !/fechad|encerr|perd|cancel|inativ/i.test(`${a.andamento ?? ''} ${a.situacao ?? ''}`))

  const papeis = ['Proprietário', ...(p.e_cliente ? ['também Cliente (lado comprador)'] : [])]
  const persona = []
  if (imoveis.length >= 3) persona.push(`investidor / multi-imóvel (${imoveis.length})`)
  else if (imoveis.length) persona.push(`${imoveis.length} imóvel(is) no Nido`)
  if (buscandoAgora.length) persona.push('está buscando imóvel AGORA')
  else if (atend.length) persona.push('já buscou imóvel conosco')
  if (fech.length) persona.push(`${fech.length} negócio(s) fechado(s)`)
  if (!atend.length && !fech.length && !props.length) persona.push('relação só de listagem (nunca negociou conosco)')

  const dadosPessoais = [idade ? `${idade} anos` : null, p.estado_civil, p.profissao,
    p.sexo === 'M' ? 'masc.' : p.sexo === 'F' ? 'fem.' : null].filter(Boolean).join(' · ')
  const resid = [p.endereco, p.numero && String(p.numero) !== '0' ? p.numero : null, p.bairro, p.cidade, p.uf]
    .map(x => (x ?? '').toString().trim()).filter(Boolean).join(', ')
  const tels = [p.telefone_1, p.telefone_2, p.telefone_3].filter(Boolean).join(' · ') || '—'
  const mails = [p.email_1, p.email_2, p.email_3].filter(Boolean).join(' · ') || '—'
  const assessores = [...new Set(profs.map(x => `${x.nome_uso}${x.equipe ? ' (' + x.equipe + ')' : ''}`))]

  // PERFIL DE ATUAÇÃO: padrão do portfólio (classe, tipos, regiões, faixa de valor, disposição).
  const classe = (t) => { const s = (t || '').toUpperCase()
    if (/SALA|LOJA|COMERCIAL|GALP|PR[ÉE]DIO|ANDAR|LAJE|PONTO|ESCANINHO|POUSADA/.test(s)) return 'Comercial'
    if (/TERRENO|LOTE|CH[ÁA]CARA|CHACARA|FAZENDA|S[ÍI]TIO|[ÁA]REA/.test(s)) return 'Terreno/Rural'
    if (/APART|CASA|KIT|FLAT|COBERT|RESID|DUPLEX|SOBRADO|LOFT|VILA/.test(s)) return 'Residencial'
    return 'Outro' }
  const regiaoPretty = (b) => (b || '').replace(/Setor De Habita[çc][õo]es Individuais Sul/i, 'Lago Sul')
    .replace(/Setor De Habita[çc][õo]es Individuais Norte/i, 'Lago Norte').trim()
  const tally = (arr, keyf) => { const m = new Map(); for (const x of arr) { const k = (keyf(x) || '').trim() || '—'; m.set(k, (m.get(k) || 0) + 1) } return [...m.entries()].sort((a, b) => b[1] - a[1]) }
  const topN = (t, n = 5) => t.slice(0, n).map(([k, c]) => `${k} (${c})`).join(' · ')
  const tClasse = tally(imoveis, i => classe(i.tipo_imovel))
  const tReg = tally(imoveis, i => regiaoPretty(i.bairro))
  const vendas = imoveis.map(i => Number(i.preco_venda) || 0).filter(v => v > 0)
  const locs = imoveis.map(i => Number(i.preco_locacao) || 0).filter(v => v > 0)
  const faixaV = vendas.length ? `${brl(Math.min(...vendas))} – ${brl(Math.max(...vendas))}` : null
  const faixaL = locs.length ? `${brl(Math.min(...locs))} – ${brl(Math.max(...locs))}` : null
  const nVenda = imoveis.filter(i => i.disponivel_venda).length
  const nLoc = imoveis.filter(i => i.disponivel_locacao).length
  const nVago = imoveis.filter(i => i.vago).length
  // Demanda (o que ele busca nos atendimentos) por classe/tipo/região.
  const tBusca = tally(atend, a => classe(a.tipo_imovel_buscado))
  const tBuscaTipo = tally(atend, a => a.tipo_imovel_buscado)
  const tBuscaReg = tally(atend, a => regiaoPretty(a.bairro_interesse || a.regiao_interesse))
  if (imoveis.length && tClasse[0] && tReg[0]) persona.push(`foco: ${tClasse[0][0].toLowerCase()} em ${tReg[0][0]}`)

  const L = []
  L.push(`# Dossiê do Proprietário — rodada de escuta TRK`)
  L.push(`_Gerado do dw_trk (Nido). Perfil = o que o Nido sabe da pessoa; status de imóvel é de anúncio (CRM de corretagem)._\n`)

  L.push(`## Quem é`)
  L.push(`- **Nome:** ${p.tratamento ? p.tratamento + ' ' : ''}${p.nome}  (cód ${p.codigo_pessoa}${p.situacao ? ` · ${p.situacao}` : ''})`)
  L.push(`- **Papel:** ${papeis.join(' · ')}`)
  L.push(`- **Telefones:** ${tels}`)
  L.push(`- **E-mails:** ${mails}`)
  if (dadosPessoais) L.push(`- **Dados pessoais:** ${dadosPessoais}`)
  if (resid) L.push(`- **Reside em:** ${resid}`)
  L.push(`- **Relação com a TRK:** ${desde ? `desde ${desde}` : 'sem negócio registrado'} · ${imoveis.length} imóveis · ${fech.length} fechamentos · ${atend.length} atendimentos · ${props.length} propostas`)
  L.push(`- **Última interação:** ${ultima ? d(ultima) : '—'}`)
  L.push(`- **Síntese:** ${persona.join('; ') || '—'}`)
  if (assessores.length) L.push(`- **Já foi atendido por:** ${assessores.join('; ')}`)

  L.push(`\n## Perfil de atuação (padrão dos imóveis dele)`)
  if (imoveis.length) {
    L.push(`- **Classe:** ${topN(tClasse)}`)
    L.push(`- **Tipos:** ${topN(tally(imoveis, i => i.tipo_imovel), 6)}`)
    L.push(`- **Regiões:** ${topN(tReg, 6)}`)
    if (faixaV) L.push(`- **Faixa de valor (venda):** ${faixaV}`)
    if (faixaL) L.push(`- **Faixa de valor (locação):** ${faixaL}`)
    L.push(`- **Disposição:** ${[nVenda ? `${nVenda} à venda` : null, nLoc ? `${nLoc} p/ locação` : null, nVago ? `${nVago} vago(s)` : null].filter(Boolean).join(' · ') || 'não anunciados'}`)
  } else L.push(`_Sem imóvel vinculado pra inferir padrão._`)

  L.push(`\n## O que busca / buscou (demanda)`)
  if (atend.length) {
    const reg = tBuscaReg.filter(([k]) => k !== '—')
    L.push(`- **Resumo:** ${topN(tBuscaTipo, 3)}${reg.length ? ` · regiões: ${topN(reg, 3)}` : ''}`)
    for (const a of atend) L.push(`- ${atLine(a)}`)
  } else L.push(`_Sem atendimento registrado — não procurou comprar/alugar pela TRK._`)
  if (props.length) {
    L.push(`\n**Propostas:**`)
    for (const x of props) L.push(`- ${prLine(x)}`)
  }

  L.push(`\n## Imóveis (${imoveis.length})`)
  if (!imoveis.length) L.push(`_Nenhum imóvel vinculado a este proprietário no Nido._`)
  for (const i of imoveis) {
    L.push(`\n### ${i.codigo_imovel} — ${i.tipo_imovel || 'tipo?'} ${i.exclusividade ? '⭐exclusivo' : ''}`)
    L.push(`- **Endereço:** ${endereco(i) || '—'}`)
    L.push(`- **Status (anúncio):** ${[i.situacao, i.situacao_detalhe].filter(Boolean).join(' / ') || '—'}${i.vago ? ' · ⚠️VAGO' : ''}`)
    L.push(`- **Preços:** locação ${brl(i.preco_locacao)} · venda ${brl(i.preco_venda)}`)
    L.push(`- **Disponível:** ${[i.disponivel_locacao ? 'locação' : null, i.disponivel_venda ? 'venda' : null].filter(Boolean).join(' + ') || 'não anunciado'}`)
    L.push(`- **Atend. por:** ${profDe(i.codigo_imovel).join('; ') || '—'}`)
  }

  L.push(`\n## Histórico de negócios (fechamentos: ${fech.length})`)
  if (!fech.length) L.push(`_Sem fechamento registrado._`)
  for (const f of fech.slice(0, 10)) L.push(`- ${d(f.data_fechamento)} · ${f.tipo_negocio} · ${brl(f.valor_fechamento)} · ${f.situacao} · imóvel ${f.codigo_imovel}`)

  const ops = oportunidades(imoveis, fech)
  for (const a of buscandoAgora) ops.unshift(`🔥 Buscando AGORA: ${atLine(a)} — gancho direto pra conversa.`)
  if (p.e_cliente && !buscandoAgora.length) ops.push('Marcado como Cliente (comprador) no Nido — sondar intenção de compra.')
  L.push(`\n## Possíveis oportunidades (sugeridas)`)
  for (const o of [...new Set(ops)]) L.push(`- ${o}`)

  L.push(`\n## Pontos de atenção / Próximo passo`)
  L.push(`- _(preencher na conversa — não está no DW)_`)

  return {
    md: L.join('\n'),
    dados: {
      nome: p.nome, telefones: tels, papeis, persona, desde, idade,
      n_imoveis: imoveis.length, n_fechamentos: fech.length, n_atendimentos: atend.length, n_propostas: props.length,
      buscando_agora: buscandoAgora.map(atLine), oportunidades: [...new Set(ops)],
    },
  }
}

async function resolverCodigo(dw, { codigoFlag, sample, termo }) {
  if (codigoFlag) return codigoFlag
  if (sample) {
    const r = await dw`
      SELECT codigo_proprietario AS c, count(*) n FROM nido_imoveis
      WHERE codigo_proprietario IS NOT NULL
      GROUP BY codigo_proprietario HAVING count(*) BETWEEN 2 AND 4
      ORDER BY n DESC LIMIT 1`
    return r[0]?.c
  }
  if (!termo) { console.error('Informe um nome, --codigo N, --sample ou --fila'); process.exit(1) }
  const m = await dw`
    SELECT codigo_pessoa, nome FROM nido_pessoas
    WHERE e_proprietario IS TRUE AND nome ILIKE ${'%' + termo + '%'}
    ORDER BY nome LIMIT 25`
  if (m.length === 0) { console.error(`Nenhum proprietário com "${termo}".`); process.exit(1) }
  if (m.length > 1) {
    console.error(`Ambíguo (${m.length}). Refine ou use --codigo:`)
    for (const p of m) console.error(`  ${p.codigo_pessoa}  ${p.nome}`)
    process.exit(1)
  }
  return m[0].codigo_pessoa
}

async function main() {
  const DW = envGet('DW_DATABASE_URL') || envGet('DW_TRK_URL')
  if (!DW) { console.error('Falta DW_DATABASE_URL / DW_TRK_URL'); process.exit(1) }
  const args = process.argv.slice(2)
  const dw = postgres(DW, { max: 1, connect_timeout: 15 })

  try {
    // ── Modo fila: consome dossie_fila do Supabase ──
    if (args.includes('--fila')) {
      const SB = envGet('DATABASE_URL')
      if (!SB) { console.error('Falta DATABASE_URL (Supabase) pro modo --fila'); process.exit(1) }
      const sb = postgres(SB, { ssl: 'require', max: 1, idle_timeout: 30 })
      try {
        const pend = await sb`SELECT codigo_pessoa, nome FROM public.dossie_fila WHERE status = 'pendente' ORDER BY criado_em LIMIT 300`
        console.log(`fila: ${pend.length} pendente(s)`)
        let ok = 0, erro = 0
        for (const row of pend) {
          const cod = row.codigo_pessoa
          try {
            const r = await montarDossie(dw, cod)
            if (!r) {
              await sb`UPDATE public.dossie_fila SET status='erro', erro='não encontrado no DW' WHERE codigo_pessoa=${cod}`
              console.log(`  ${cod} ✗ não encontrado`); erro++; continue
            }
            await sb`
              INSERT INTO public.dossie_proprietario (codigo_pessoa, nome, markdown, dados, gerado_em)
              VALUES (${cod}, ${r.dados.nome ?? null}, ${r.md}, ${sb.json(r.dados)}, now())
              ON CONFLICT (codigo_pessoa) DO UPDATE SET
                nome=EXCLUDED.nome, markdown=EXCLUDED.markdown, dados=EXCLUDED.dados, gerado_em=now()`
            await sb`UPDATE public.dossie_fila SET status='gerado', erro=NULL, gerado_em=now() WHERE codigo_pessoa=${cod}`
            console.log(`  ${cod} ✓ ${r.dados.nome}`); ok++
          } catch (e) {
            await sb`UPDATE public.dossie_fila SET status='erro', erro=${String(e.message).slice(0, 300)} WHERE codigo_pessoa=${cod}`
            console.log(`  ${cod} ✗ ${e.message}`); erro++
          }
        }
        console.log(`\nPronto: ${ok} gerado(s), ${erro} erro(s).`)
      } finally { await sb.end() }
      return
    }

    // ── Modo CLI: um proprietário ──
    const codigoFlag = args.includes('--codigo') ? args[args.indexOf('--codigo') + 1] : null
    const sample = args.includes('--sample')
    const termo = args.filter(a => !a.startsWith('--') && a !== codigoFlag).join(' ').trim()
    const cod = await resolverCodigo(dw, { codigoFlag, sample, termo })
    if (!cod) { console.error('Não consegui resolver o proprietário.'); process.exit(1) }
    const r = await montarDossie(dw, cod)
    if (!r) { console.error('Proprietário não encontrado: ' + cod); process.exit(1) }
    const outDir = process.env.DOSSIE_OUT_DIR || 'C:/Users/atend/AppData/Local/Temp/claude/C--Users-atend/db426454-5854-4fb3-9c6d-ada0ad7a04ab/scratchpad'
    try { writeFileSync(resolve(outDir, `dossie_${cod}.md`), r.md, 'utf8') } catch {}
    console.log(r.md)
  } catch (e) {
    console.error('FALHA:', e.message)
    process.exit(1)
  } finally {
    await dw.end()
  }
}

main()
