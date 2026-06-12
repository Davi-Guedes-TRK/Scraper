-- Espelho do dw_trk (Nido) no Supabase — alimentado por scripts/dw_sync.mjs
-- (Tarefa Agendada na máquina do Davi, única que alcança 192.168.64.106).
-- Finalidade: dedup de imóvel ANTES de gastar ônus + lookup de proprietário.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS dw_imoveis (
  codigo_imovel       text PRIMARY KEY,
  codigo_proprietario text,
  endereco_bruto      text,        -- logradouro + complemento + nº (como veio do Nido)
  endereco_norm       text,        -- enderecoNorm() — p/ fuzzy (trgm)
  endereco_chave      text,        -- chaveEndereco().chave — match exato "QI 11|CJ 7|17"
  setor               text,        -- SHIS/SHIN… — confirma/derruba o match (não entra na chave)
  bairro              text,
  cidade              text,
  tipo_imovel         text,
  situacao            text,
  disponivel_venda    boolean,
  preco_venda         numeric,
  data_atualizacao    timestamptz,
  sincronizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dw_imoveis_chave_idx ON dw_imoveis (endereco_chave);
CREATE INDEX IF NOT EXISTS dw_imoveis_norm_trgm ON dw_imoveis USING gin (endereco_norm gin_trgm_ops);

CREATE TABLE IF NOT EXISTS dw_pessoas (
  codigo_pessoa   text PRIMARY KEY,
  nome            text,
  nome_norm       text,            -- nomeNorm() — match de proprietário é por NOME (Nido não tem CPF)
  e_proprietario  boolean,
  telefones       text[],
  emails          text[],
  cidade          text,
  uf              text,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dw_pessoas_nome_idx  ON dw_pessoas (nome_norm);
CREATE INDEX IF NOT EXISTS dw_pessoas_nome_trgm ON dw_pessoas USING gin (nome_norm gin_trgm_ops);
