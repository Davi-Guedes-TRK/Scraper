import postgres from 'postgres'
const sql = postgres('postgresql://postgres.vztshmxrocxdlqhyqmbm:xPu4BDesK%2A%23mZ8v@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', { ssl: 'require', max: 1 })

await sql`UPDATE public.profiles SET onboarding_completo = false WHERE email = 'd.guedes@trkimoveis.com.br'`

const [r] = await sql`SELECT email, papel, onboarding_completo FROM public.profiles WHERE email = 'd.guedes@trkimoveis.com.br'`
console.log('✓', r.email, '→ onboarding_completo =', r.onboarding_completo)
await sql.end()
