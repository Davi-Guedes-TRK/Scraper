import postgres from 'postgres'

const DB = 'postgresql://postgres.vztshmxrocxdlqhyqmbm:xPu4BDesK%2A%23mZ8v@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
const sql = postgres(DB, { ssl: 'require', max: 1, idle_timeout: 30 })

async function run(label, query) {
  try {
    await query()
    console.log(`✓ ${label}`)
  } catch (e) {
    // NOTICEs do Postgres chegam como erros no driver mas não são fatais
    if (e.severity === 'NOTICE') { console.log(`  (aviso) ${e.message}`); return }
    console.error(`✗ ${label}: ${e.message}`)
    if (e.detail) console.error(`  detalhe: ${e.detail}`)
  }
}

console.log('Conectando…\n')

// 1. Enum
await run('criar enum papel_usuario', () => sql.unsafe(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'papel_usuario') THEN
      CREATE TYPE papel_usuario AS ENUM ('captador', 'operador', 'gestor', 'admin');
    END IF;
  END$$;
`))

// 2. Colunas
await run('ADD COLUMN papel', () => sql.unsafe(
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS papel papel_usuario NOT NULL DEFAULT 'captador'`
))
await run('ADD COLUMN avatar_url', () => sql.unsafe(
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text`
))
await run('ADD COLUMN onboarding_completo', () => sql.unsafe(
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completo boolean NOT NULL DEFAULT false`
))
await run('ADD COLUMN tema', () => sql.unsafe(
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tema text DEFAULT 'system'`
))
await run('ADD COLUMN updated_at', () => sql.unsafe(
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`
))

// 3. Usuários existentes → admin (quem já tinha conta antes = Davi)
await run('setar papel=admin para usuários existentes', () => sql.unsafe(
  `UPDATE public.profiles SET papel = 'admin', onboarding_completo = true WHERE papel = 'captador'`
))

// 4. Função + trigger de novo usuário
await run('criar função handle_new_user', () => sql.unsafe(`
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.profiles (id, nome, email, papel)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email,
      COALESCE((NEW.raw_user_meta_data->>'papel')::papel_usuario, 'captador'::papel_usuario)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END; $$;
`))

await run('drop trigger on_auth_user_created (se existir)', () => sql.unsafe(
  `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`
))
await run('criar trigger on_auth_user_created', () => sql.unsafe(
  `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`
))

// 5. Função + trigger updated_at
await run('criar função set_updated_at', () => sql.unsafe(`
  CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
`))
await run('drop trigger profiles_updated_at (se existir)', () => sql.unsafe(
  `DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles`
))
await run('criar trigger profiles_updated_at', () => sql.unsafe(
  `CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`
))

// 6. RLS
await run('habilitar RLS em profiles', () => sql.unsafe(
  `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`
))
await run('drop policy admin select todos (se existir)', () => sql.unsafe(
  `DROP POLICY IF EXISTS "profiles: admin select todos" ON public.profiles`
))
await run('criar policy admin select todos', () => sql.unsafe(`
  CREATE POLICY "profiles: admin select todos"
    ON public.profiles FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.papel = 'admin')
    )
`))

console.log('\nVerificando resultado final…')
const final = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
  ORDER BY ordinal_position
`
console.log('Colunas:', final.map(c => c.column_name).join(', '))

const users = await sql`SELECT nome, email, papel, onboarding_completo FROM public.profiles`
console.log('Usuários:')
users.forEach(u => console.log(`  ${u.email ?? u.nome} → papel=${u.papel}, onboarding=${u.onboarding_completo}`))

await sql.end()
console.log('\nPronto!')
