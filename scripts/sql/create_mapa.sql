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
