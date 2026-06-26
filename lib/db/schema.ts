import { pgTable, text, boolean, timestamp, jsonb, doublePrecision, bigint } from 'drizzle-orm/pg-core'

const imoveisBase = {
  id: bigint('id', { mode: 'number' }),
  link: text('link').primaryKey(),
  titulo: text('titulo'),
  preco: text('preco'),
  area_m2: text('area_m2'),
  quartos: text('quartos'),
  suites: text('suites'),
  vagas: text('vagas'),
  banheiros: text('banheiros'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  estado: text('estado'),
  tipo_imovel: text('tipo_imovel'),
  descricao: text('descricao'),
  telefone: text('telefone'),
  nome_anunciante: text('nome_anunciante'),
  tipo_anunciante: text('tipo_anunciante'),
  creci: text('creci'),
  id_anuncio: text('id_anuncio'),
  data_publicacao: text('data_publicacao'),
  data_anuncio: text('data_anuncio'),
  dados_brutos: jsonb('dados_brutos'),
  imagens: text('imagens'),
  coletado_em: timestamp('coletado_em', { withTimezone: true }),
  atualizado_em: timestamp('atualizado_em', { withTimezone: true }),
  validado_em: timestamp('validado_em', { withTimezone: true }),
  ativo: boolean('ativo').default(true),
  preco_reduzido: boolean('preco_reduzido').default(false),
  bairro_id: text('bairro_id'),
  tipo: text('tipo'),
  // workflow
  status_triagem: text('status_triagem'),
  status_solicitacao: text('status_solicitacao'),
  status_solicitacao_em: timestamp('status_solicitacao_em', { withTimezone: true }),
  visitado_em: timestamp('visitado_em', { withTimezone: true }),
  geocoded_em: timestamp('geocoded_em', { withTimezone: true }),
  pistas_ia: jsonb('pistas_ia'),
  pistas_imagem: jsonb('pistas_imagem'),
  maps_link: text('maps_link'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  endereco: text('endereco'),
  endereco_norm: text('endereco_norm'),
  predio_id: text('predio_id'),
  numero_matricula: text('numero_matricula'),
  // dedup por pHash de imagem
  img_hashes: jsonb('img_hashes'),        // string[] de pHash (hex) das fotos amostradas
  grupo_id: text('grupo_id'),             // id do cluster (mesmo imóvel em portais diferentes)
  is_canonico: boolean('is_canonico').default(false), // linha representante do grupo
  sem_exclusividade: boolean('sem_exclusividade'),    // grupo tem >=2 anunciantes distintos
  grupo_meta: jsonb('grupo_meta'),        // {n, portais[], anunciantes[]} — só no canônico
}

export const imoveisOlx       = pgTable('imoveis_olx',       imoveisBase)
export const imoveisDfimoveis = pgTable('imoveis_dfimoveis', imoveisBase)
export const imoveisVivareal  = pgTable('imoveis_vivareal',  imoveisBase)
export const imoveisZap       = pgTable('imoveis_zap',       imoveisBase)

export type Imovel = typeof imoveisOlx.$inferSelect
export type NovoImovel = typeof imoveisOlx.$inferInsert

export const mapaDemanda = pgTable('mapa_demanda', {
  bairro: text('bairro').primaryKey(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  peso: bigint('peso', { mode: 'number' })
})

export const mapaAtivos = pgTable('mapa_ativos', {
  codigo_imovel: text('codigo_imovel').primaryKey(),
  bairro: text('bairro'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  tipo_imovel: text('tipo_imovel'),
  preco: doublePrecision('preco')
})
