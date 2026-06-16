// Define papel='admin' no profile de um usuário JÁ criado (no painel do Supabase).
// Mexe só em public.profiles (dado do app) — não toca no schema auth.
// Uso: node scripts/_set_admin.mjs "email@dominio"
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const url = (env.match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '').trim()
const email = process.argv[2]
if (!email) { console.error('Uso: node scripts/_set_admin.mjs "email"'); process.exit(1) }

const sql = postgres(url, { ssl: 'require', max: 1 })
const achados = await sql`SELECT id, nome, email, papel FROM public.profiles WHERE lower(email) = ${email.toLowerCase()}`

if (!achados.length) {
  console.log(`✗ Nenhum profile com email "${email}".`)
  console.log('  → Crie o usuário primeiro no painel: Supabase → Authentication → Add user.')
  console.log('    O trigger cria o profile automaticamente; depois rode este script de novo.')
} else {
  const p = achados[0]
  if (p.papel === 'admin') {
    console.log(`• ${p.email} já é admin (nada a fazer).`)
  } else {
    await sql`UPDATE public.profiles SET papel = 'admin', onboarding_completo = true WHERE id = ${p.id}`
    console.log(`✓ ${p.email} (${p.nome ?? 'sem nome'}): papel ${p.papel} → admin`)
  }
}
await sql.end()
