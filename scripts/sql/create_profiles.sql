-- Migration: tabela de perfis de usuário
-- Executar no Supabase SQL Editor (ou via CLI: supabase db push)
-- Cria: profiles, enum papel_usuario, trigger de auto-criação, RLS básico

-- ── 1. Enum de papéis ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papel_usuario') THEN
    CREATE TYPE papel_usuario AS ENUM ('captador', 'operador', 'gestor', 'admin');
  END IF;
END$$;

-- ── 2. Tabela profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        text,
  papel       papel_usuario NOT NULL DEFAULT 'captador',
  avatar_url  text,
  onboarding_completo boolean NOT NULL DEFAULT false,
  tema        text CHECK (tema IN ('light', 'dark', 'system')) DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Trigger: criar profile automaticamente no signup ────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, papel)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- ── 4. Trigger: atualizar updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê e atualiza apenas o próprio perfil
DROP POLICY IF EXISTS "profiles: select próprio" ON public.profiles;
CREATE POLICY "profiles: select próprio"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles: update próprio" ON public.profiles;
CREATE POLICY "profiles: update próprio"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins lêem todos os perfis (para ranking de captadores, etc.)
DROP POLICY IF EXISTS "profiles: admin select todos" ON public.profiles;
CREATE POLICY "profiles: admin select todos"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.papel = 'admin'
    )
  );

-- ── 6. Profile para usuários já existentes (retroativo) ───────────────────────
-- Cria profiles para quem já tinha conta antes desta migration
INSERT INTO public.profiles (id, nome, papel)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'admin'::papel_usuario  -- quem já existia antes = admin (Davi)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ── 7. RLS em cartorio_processos (se existir) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cartorio_processos' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.cartorio_processos ENABLE ROW LEVEL SECURITY';

    -- Cada usuário vê apenas seus próprios processos
    EXECUTE $policy$
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
    $policy$;

    EXECUTE $policy$
      DROP POLICY IF EXISTS "cartorio: insert próprio" ON public.cartorio_processos;
      CREATE POLICY "cartorio: insert próprio"
        ON public.cartorio_processos FOR INSERT
        WITH CHECK (usuario_id = auth.uid());
    $policy$;

    EXECUTE $policy$
      DROP POLICY IF EXISTS "cartorio: update próprio" ON public.cartorio_processos;
      CREATE POLICY "cartorio: update próprio"
        ON public.cartorio_processos FOR UPDATE
        USING (usuario_id = auth.uid())
        WITH CHECK (usuario_id = auth.uid());
    $policy$;

    RAISE NOTICE 'RLS aplicado em cartorio_processos';
  ELSE
    RAISE NOTICE 'Tabela cartorio_processos não encontrada — RLS pulado';
  END IF;
END$$;
