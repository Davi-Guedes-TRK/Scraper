// Cria um usuário ADMIN via API admin oficial do Supabase (caminho sancionado —
// NÃO forja linhas no schema auth). O trigger handle_new_user lê
// raw_user_meta_data->>'papel' e já cria o profile como admin.
//
// Precisa da service role key. Uso:
//   node scripts/_criar_usuario_admin.mjs "email@dominio" "Nome Completo"
// Lê NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do .env.local
// (aceita também SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE como aliases).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1] ?? '').trim()

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY') || get('SUPABASE_SERVICE_ROLE')
const [email, nome] = process.argv.slice(2)

if (!serviceKey) { console.error('Falta a service role key no .env.local (SUPABASE_SERVICE_ROLE_KEY).'); process.exit(1) }
if (!email || !nome) { console.error('Uso: node scripts/_criar_usuario_admin.mjs "email" "Nome Completo"'); process.exit(1) }

// senha temporária aleatória — o usuário troca via "Esqueci a senha"
const tempPw = 'Trk!' + Math.abs([...email].reduce((h, c) => (h * 33 + c.charCodeAt(0)) | 0, 7)).toString(36) + 'X9'

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: tempPw,
  email_confirm: true,                                   // já confirmado, pode logar
  user_metadata: { papel: 'admin', full_name: nome },    // trigger cria profile como admin
})
if (error) { console.error('Erro:', error.message); process.exit(1) }

console.log(`✓ Usuário criado: ${data.user.email} (id ${data.user.id})`)
console.log(`  papel: admin (via user_metadata → trigger handle_new_user)`)
console.log(`  senha temporária: ${tempPw}`)
console.log(`  → peça pro ${nome.split(' ')[0]} usar "Esqueci minha senha" no login pra definir a dele.`)
