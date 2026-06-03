'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const clean = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

// RLS (auth.uid() = responsavel) garante que ninguém mexe no processo de outro.
export async function addProcesso(form: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('cartorio_processos').insert({
    responsavel: user.id,
    matricula: clean(form.get('matricula')),
    codigo_imovel: clean(form.get('codigo_imovel')),
    cartorio: clean(form.get('cartorio')),
    regiao: clean(form.get('regiao')),
    observacao: clean(form.get('observacao')),
    status: (form.get('status') as string) || 'pendente',
  })
  revalidatePath('/cartorio')
}

export async function setStatus(id: string, status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('cartorio_processos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/cartorio')
}

export async function delProcesso(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('cartorio_processos').delete().eq('id', id)
  revalidatePath('/cartorio')
}
