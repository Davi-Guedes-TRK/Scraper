-- Colunas de deduplicação por pHash de imagem + flag de exclusividade.
-- Rodar uma vez no Supabase (SQL editor) ou via psql. Idempotente.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'imoveis_olx','imoveis_dfimoveis','imoveis_wimoveis','imoveis_facebook',
    'imoveis_vivareal','imoveis_zap','imoveis_chavesnamao'
  ]
  LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS img_hashes        jsonb,
        ADD COLUMN IF NOT EXISTS grupo_id          text,
        ADD COLUMN IF NOT EXISTS is_canonico       boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS sem_exclusividade boolean,
        ADD COLUMN IF NOT EXISTS grupo_meta        jsonb
    $f$, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (grupo_id)', t || '_grupo_id_idx', t);
  END LOOP;
END $$;
