-- Adiciona timestamp de quando o status_solicitacao foi alterado pela última vez.
-- Rodar uma vez no Supabase (SQL editor). Idempotente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'imoveis_olx','imoveis_dfimoveis','imoveis_wimoveis','imoveis_facebook',
    'imoveis_vivareal','imoveis_zap','imoveis_chavesnamao'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS status_solicitacao_em timestamptz', t);
  END LOOP;
END $$;
