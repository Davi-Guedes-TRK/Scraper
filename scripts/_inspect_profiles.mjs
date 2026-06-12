import postgres from 'postgres'
const sql = postgres('postgresql://postgres.vztshmxrocxdlqhyqmbm:xPu4BDesK%2A%23mZ8v@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', { ssl: 'require', max: 1 })

// Estado final de profiles
const cols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
  ORDER BY ordinal_position
`
console.log('=== profiles (colunas) ===')
cols.forEach(c => console.log(` ${c.column_name}: ${c.data_type} ${c.column_default ? `(default: ${c.column_default})` : ''}`))

// Usuários existentes
const users = await sql`SELECT id, nome, email, papel, onboarding_completo FROM public.profiles`
console.log('\n=== profiles (dados) ===')
users.forEach(u => console.log(` ${u.email ?? u.nome} → papel=${u.papel}, onboarding=${u.onboarding_completo}`))

// Enum
const enums = await sql`SELECT typname FROM pg_type WHERE typname = 'papel_usuario'`
console.log('\n=== enum papel_usuario existe:', enums.length > 0)

// Triggers
const triggers = await sql`
  SELECT trigger_name, event_manipulation, event_object_table
  FROM information_schema.triggers
  WHERE trigger_name IN ('on_auth_user_created', 'profiles_updated_at')
`
console.log('\n=== triggers ===')
triggers.forEach(t => console.log(` ${t.trigger_name} on ${t.event_object_table}`))

// Cartorio columns
const cartorioCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'cartorio_processos'
  ORDER BY ordinal_position
`
console.log('\n=== cartorio_processos (colunas) ===')
if (cartorioCols.length === 0) console.log(' (tabela não encontrada)')
else cartorioCols.forEach(c => console.log(` ${c.column_name}`))

await sql.end()
