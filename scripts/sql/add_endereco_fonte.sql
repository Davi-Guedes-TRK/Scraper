-- Confiança do endereço resolvido na triagem, usada para o GATE de auto-envio
-- ao cartório: 'geoportal' = endereço oficial do IDE-DF (grau-cartório, auto-envia);
-- 'maps' = reverse geocode/place name (fraco); 'manual' = digitado à mão; NULL = sem info.
-- Rodar uma vez no Supabase (SQL editor). Idempotente.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'imoveis_olx','imoveis_dfimoveis','imoveis_wimoveis','imoveis_facebook',
    'imoveis_vivareal','imoveis_zap','imoveis_chavesnamao'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS endereco_fonte text', t);
  END LOOP;
END $$;
