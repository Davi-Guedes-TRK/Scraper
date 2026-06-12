-- Estado do pipeline de ônus (Fase 3): uma linha por imóvel aprovado que recebeu
-- matrícula. Evita mexer nas 7 tabelas de portal + view (gotcha do CREATE OR REPLACE).
-- Fluxo: matrícula recebida → gate dedup (lib/onus-gate.ts) → 'nenhum' = fila p/
-- pipefy_portal_fill.py --from-gate → ônus recebida por e-mail → extração → contato.

CREATE TABLE IF NOT EXISTS onus_pipeline (
  link                text PRIMARY KEY,          -- link do anúncio (mesma chave dos portais)
  portal              text,
  matricula           text,
  endereco            text,
  bairro              text,
  cidade              text,
  card_id             text,                      -- card no COM - Oportunidades
  dedup_nivel         text,                      -- exato | provavel | nenhum
  dedup_codigos       text[],                    -- códigos Nido dos matches
  dedup_em            timestamptz,
  onus_solicitada_em  timestamptz,               -- marcada pelo pipefy_portal_fill.py --from-gate
  onus_recebida_em    timestamptz,
  proprietario        text,
  cpf                 text,
  proprietario_fonte  text,                      -- dw | busca-pessoa | manual
  telefones           text[],
  emails              text[],
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onus_pipeline_matricula_idx ON onus_pipeline (matricula);
CREATE INDEX IF NOT EXISTS onus_pipeline_fila_idx ON onus_pipeline (dedup_nivel)
  WHERE onus_solicitada_em IS NULL;
