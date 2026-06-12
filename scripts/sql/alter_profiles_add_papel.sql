-- Migration delta: adiciona papel e colunas de onboarding à tabela profiles existente
-- A tabela já existe com: id, nome, email, cargo, created_at

-- ── 1. Enum de papéis ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papel_usuario') THEN
    CREATE TYPE papel_usuario AS ENUM ('captador', 'operador', 'gestor', 'admin');
  END IF;
END$$;

-- ── 2. Adicionar colunas faltantes ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS papel       papel_usuario NOT NULL DEFAULT 'captador',
  ADD COLUMN IF NOT EXISTS avatar_url  text,
  ADD COLUMN IF NOT EXISTS onboarding_completo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tema        text CHECK (tema IN ('light', 'dark', 'system')) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- ── 3. Usuários existentes viram admin (quem já tinha conta antes = Davi) ───────
UPDATE public.profiles SET papel = 'admin', onboarding_completo = true
WHERE papel = 'captador';  -- default aplicado; todos existentes são admin

-- ── 4. Trigger: auto-criar profile no signup ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, papel)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'papel')::papel_usuario,
      'captador'::papel_usuario
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 5. Trigger: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. RLS: política admin lê todos (as básicas já existem) ───────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: admin select todos" ON public.profiles;
CREATE POLICY "profiles: admin select todos"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.papel = 'admin'
    )
  );

-- ── 7. RLS cartorio_processos (se existir) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'cartorio_processos' AND table_schema = 'public'
  ) THEN
    EXECUTE 'ALTER TABLE public.cartorio_processos ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      DROP POLICY IF EXISTS "cartorio: select próprio" ON public.cartorio_processos;
      CREATE POLICY "cartorio: select próprio"
        ON public.cartorio_processos FOR SELECT
        USING (
          usuario_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.papel IN ('gestor', 'admin')
          )
        );
    $p$;
    RAISE NOTICE 'RLS aplicado em cartorio_processos';
  ELSE
    RAISE NOTICE 'cartorio_processos não encontrada — RLS pulado';
  END IF;
END$$;
