-- Fila e resultado dos dossiês de proprietário (rodada de escuta / roteiro Eduarda).
-- Seleção vem da tela /proprietarios (lê o espelho dw_pessoas). O worker on-prem
-- (scripts/dossie_proprietario.mjs --fila) consome a fila, gera do dw_trk e grava aqui.

CREATE TABLE IF NOT EXISTS public.dossie_fila (
  codigo_pessoa text PRIMARY KEY,
  nome          text,
  status        text NOT NULL DEFAULT 'pendente',   -- pendente | gerado | erro
  erro          text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  gerado_em     timestamptz
);

CREATE TABLE IF NOT EXISTS public.dossie_proprietario (
  codigo_pessoa text PRIMARY KEY,
  nome          text,
  markdown      text,
  dados         jsonb,
  gerado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossie_fila_status ON public.dossie_fila (status);
