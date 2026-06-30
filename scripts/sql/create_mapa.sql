-- Mapa Estratégico — tabelas no contrato do /api/mapa (frontend existente).
-- Alimentado on-prem por scripts/mapa_sync.mjs. Pipe é derivado live na API
-- (pipefy_captacoes ⋈ mapa_demanda pelo bairro), então não tem tabela própria.

-- Demanda por região: bairro (UPPER, casa com pipefy_captacoes.bairro) → centroide + peso.
CREATE TABLE IF NOT EXISTS public.mapa_demanda (
  bairro          text PRIMARY KEY,           -- UPPER(bairro) — chave do join do pipe
  lat             double precision,
  lng             double precision,
  peso            integer NOT NULL DEFAULT 0, -- nº de atendimentos em aberto na região
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

-- Imóveis ativos (nido situacao='Ativo'), geocodificados. Colunas extras (endereco/geo_fonte/
-- flags) são aditivas — a API só seleciona codigo_imovel,bairro,lat,lng,tipo_imovel,preco.
-- Atendimentos em aberto, grão fino (1 linha = 1 atendimento) p/ filtros dinâmicos do heat.
-- lat/lng = centroide da RA com leve jitter (espalha pontos da mesma região → blob de calor).
CREATE TABLE IF NOT EXISTS public.mapa_atendimentos (
  codigo_atendimento text PRIMARY KEY,
  bairro             text,
  tipo_negocio       text,   -- COMPRA | LOCAÇÃO | AVALIAÇÃO
  tipo_imovel        text,   -- tipo_imovel_buscado
  classe             text,   -- Residencial | Comercial | Terreno/Rural | Outro
  tipo_utilizacao    text,
  preco_max          numeric,
  data_cadastro      timestamptz,   -- abertura do FAC (p/ filtro de janela de tempo)
  lat                double precision,
  lng                double precision,
  sincronizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mapa_ativos (
  codigo_imovel       text PRIMARY KEY,
  bairro              text,
  tipo_imovel         text,
  preco               numeric,
  disponivel_venda    boolean,
  disponivel_locacao  boolean,
  endereco            text,
  lat                 double precision,
  lng                 double precision,
  geo_fonte           text,                   -- 'coords' | 'nominatim' | 'centroide'
  sincronizado_em     timestamptz NOT NULL DEFAULT now()
);
