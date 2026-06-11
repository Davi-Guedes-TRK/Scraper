/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Busca CPF → { nome, idade, renda, telefones }
 * Busca CNPJ → { razaoSocial, situacao, telefones, socioAdmin }
 *
 * Usa Telegram (MTProto) para enviar comando ao bot e capturar a URL de resultado.
 * Requer TELEGRAM_SESSION no ambiente.
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const API_ID   = 30061221
const API_HASH = '2bcaf31daa4d085bbf6c6491124eed0d'
const GROUP    = 'Skynet VIP Oficial 🥇'
const TIMEOUT  = 45_000

let _client:  TelegramClient | null = null
let _dialogs: any[] | null = null

// ── Telegram ───────────────────────────────────────────────────────────────────

async function getClient(): Promise<TelegramClient> {
  if (_client?.connected) return _client
  const session = process.env.TELEGRAM_SESSION
  if (!session) throw new Error('TELEGRAM_SESSION não configurado')
  _client = new TelegramClient(new StringSession(session), API_ID, API_HASH, { connectionRetries: 5 })
  await _client.connect()
  await _client.getMe()
  return _client
}

async function getDialogs(client: TelegramClient): Promise<any[]> {
  if (_dialogs) return _dialogs
  _dialogs = await client.getDialogs({ limit: 200 })
  return _dialogs
}

async function sendAndWaitForUrl(command: string): Promise<string> {
  const client  = await getClient()
  const dialogs = await getDialogs(client)

  const group = dialogs.find((d: any) => d.title === GROUP)
  if (!group) throw new Error(`Grupo "${GROUP}" não encontrado`)

  const bots = dialogs.filter((d: any) => d.entity?.bot).map((d: any) => d.entity)

  // Registra o último ID de cada bot antes de enviar
  const lastIds: Record<string, number> = {}
  for (const bot of bots) {
    try {
      const msgs = await client.getMessages(bot, { limit: 1 })
      lastIds[bot.id] = (msgs[0] as any)?.id ?? 0
    } catch { lastIds[bot.id] = 0 }
  }

  await client.sendMessage(group.entity, { message: command })

  // Aguarda 2s para o bot processar antes de começar o polling
  await new Promise(r => setTimeout(r, 2000))

  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll)
      reject(new Error(`Timeout: bot não respondeu em ${TIMEOUT / 1000}s`))
    }, TIMEOUT)

    const poll = setInterval(async () => {
      try {
        for (const bot of bots) {
          const minId = lastIds[bot.id] ?? 0
          const msgs  = await client.getMessages(bot, { limit: 5, minId } as any)
          for (const msg of msgs as any[]) {
            for (const row of (msg.replyMarkup?.rows ?? [])) {
              for (const btn of (row.buttons ?? [])) {
                if (btn.url?.includes('id=') && !btn.url.includes('t.me')) {
                  clearTimeout(deadline); clearInterval(poll)
                  resolve(btn.url); return
                }
              }
            }
            const m = msg.message?.match(/https?:\/\/\S+\?id=[\w-]+/)
            if (m) { clearTimeout(deadline); clearInterval(poll); resolve(m[0]); return }
          }
        }
      } catch { /* ignora erros de poll */ }
    }, 2000)
  })
}

// ── Fetch & parse HTML ─────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar resultado`)
  return res.text()
}

function fv(html: string, label: string): string {
  const re = new RegExp(label + '[\\s\\S]*?<span class="info-value[^"]*">(.*?)<\\/span>')
  const v  = re.exec(html)?.[1]?.trim() ?? ''
  return (v === 'SEM INFORMAÇÃO' || v === 'Sem Informação' || v.startsWith('empty')) ? '' : v
}

function calcIdade(dataNasc: string): number | null {
  if (!dataNasc) return null
  const parts = dataNasc.includes('/') ? dataNasc.split('/').reverse() : dataNasc.split('-')
  const nasc  = new Date(parts.join('-'))
  if (isNaN(nasc.getTime())) return null
  const hoje  = new Date()
  let   idade = hoje.getFullYear() - nasc.getFullYear()
  const m     = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade
}

export interface Telefone {
  numero: string
  status: string
  tipo: string
  operadora: string
  whatsapp: string
}

function parsePhones(html: string): Telefone[] {
  const start = html.indexOf('>TELEFONES<')
  if (start === -1) return []
  const end     = html.indexOf('section-title', start + 100)
  const section = end === -1 ? html.slice(start) : html.slice(start, end)

  const phones: Telefone[] = []
  const cardRe = /<div class="sub-card">([\s\S]*?)<\/div>\s*<\/div>/g
  let card: RegExpExecArray | null
  while ((card = cardRe.exec(section)) !== null) {
    const b = card[1]
    const v = (lbl: string) => {
      const r = new RegExp(lbl + '[\\s\\S]*?<span class="info-value[^"]*">(.*?)<\\/span>')
      const m = r.exec(b)?.[1]?.trim() ?? ''
      return (m === 'SEM INFORMAÇÃO' || m === 'Sem Informação') ? '' : m
    }
    const raw = v('NÚMERO').replace(/\D/g, '')
    if (raw.length < 10 || raw.length > 11) continue  // filtra inválidos ("29", max_int32 etc.)
    const ddd  = raw.slice(0, 2)
    const num  = raw.slice(2)
    const numero = num.length === 9
      ? `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
      : `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
    phones.push({ numero, status: v('STATUS'), tipo: v('TIPO'), operadora: v('OPERADORA'), whatsapp: v('WHATSAPP') })
  }
  return phones
}

// ── CPF ────────────────────────────────────────────────────────────────────────

function decodeCfemail(encoded: string): string {
  // Cloudflare ofusca e-mails com XOR: primeiro byte = chave, demais = e-mail codificado
  const key = parseInt(encoded.slice(0, 2), 16)
  let result = ''
  for (let i = 2; i < encoded.length; i += 2) {
    result += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key)
  }
  return result
}

function parseEmails(html: string): string[] {
  // Cloudflare protege e-mails com __cf_email__ — decodifica o atributo data-cfemail
  const cfEmails: string[] = []
  const cfRe = /data-cfemail="([a-f0-9]+)"/gi
  let m: RegExpExecArray | null
  while ((m = cfRe.exec(html)) !== null) {
    try { cfEmails.push(decodeCfemail(m[1])) } catch { /* ignora */ }
  }
  if (cfEmails.length) return [...new Set(cfEmails)]

  // Fallback: regex direta (páginas sem Cloudflare)
  const matches = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? []
  return [...new Set(matches)].filter(e =>
    !e.includes('sentry') && !e.includes('supabase') && !e.includes('example')
  )
}

export interface CPFResult {
  cpf:            string
  nome:           string
  dataNascimento: string
  idade:          number | null
  renda:          string
  emails:         string[]
  telefones:      Telefone[]
  url:            string
}

export async function lookupCPF(cpf: string): Promise<CPFResult> {
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length !== 11) throw new Error('CPF inválido')

  const url  = await sendAndWaitForUrl(`/cpf4 ${cpfLimpo}`)
  const html = await fetchPage(url)

  return {
    cpf:            cpfLimpo,
    nome:           fv(html, 'NOME:'),
    dataNascimento: fv(html, 'DATA DE NASCIMENTO:'),
    idade:          calcIdade(fv(html, 'DATA DE NASCIMENTO:')),
    renda:          fv(html, 'RENDA:'),
    emails:         parseEmails(html),
    telefones:      parsePhones(html),
    url,
  }
}

// ── CNPJ ───────────────────────────────────────────────────────────────────────

export interface SocioAdmin {
  nome:        string
  cpf:         string
  qualificacao: string
  idade:       number | null
  renda:       string
  telefones:   Telefone[]
}

export interface CNPJResult {
  cnpj:         string
  razaoSocial:  string
  nomeFantasia: string
  situacao:     string
  capitalSocial: string
  porte:        string
  abertura:     string
  telefones:    Telefone[]
  socioAdmin:   SocioAdmin | null
  url:          string
}

export async function lookupCNPJ(cnpj: string): Promise<CNPJResult> {
  const cnpjLimpo = cnpj.replace(/\D/g, '')
  if (cnpjLimpo.length !== 14) throw new Error('CNPJ inválido')

  const cnpjFmt = cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  const url     = await sendAndWaitForUrl(`/cnpj ${cnpjFmt}`)
  const html    = await fetchPage(url)

  const razaoSocial   = fv(html, 'RAZÃO SOCIAL:')
  const nomeFantasia  = fv(html, 'NOME FANTASIA:')
  const situacao      = fv(html, 'SITUAÇÃO:')
  const capitalSocial = fv(html, 'CAPITAL SOCIAL:')
  const porte         = fv(html, 'PORTE DA EMPRESA:')
  const abertura      = fv(html, 'DATA DE ABERTURA:')
  const telefones     = parsePhones(html)

  // QSA — sócio-administrador
  const qsaStart = html.indexOf('>QUADRO DE SÓCIOS E ADMINISTRADORES<')
  const qsaHtml  = qsaStart === -1 ? '' : html.slice(qsaStart)
  let socioAdmin: SocioAdmin | null = null

  const cardRe = /<div class="sub-card">([\s\S]*?)<\/div>\s*<\/div>/g
  let card: RegExpExecArray | null
  while ((card = cardRe.exec(qsaHtml)) !== null) {
    const b      = card[1]
    const qualif = fv(b, 'QUALIFICAÇÃO:') || (b.match(/Sócio-Administrador/i)?.[0] ?? '')
    if (!qualif.toLowerCase().includes('administrador')) continue
    const cpfRaw = fv(b, 'CPF/CNPJ:').replace(/\D/g, '')
    socioAdmin = {
      nome:        fv(b, 'NOME:'),
      cpf:         cpfRaw.length === 11 ? cpfRaw : '',
      qualificacao: qualif,
      idade:       null,
      renda:       '',
      telefones:   [],
    }
    break
  }

  // Se tem CPF do sócio → enriquece com dados pessoais
  if (socioAdmin?.cpf) {
    try {
      const cpfData = await lookupCPF(socioAdmin.cpf)
      socioAdmin = {
        ...socioAdmin,
        nome:      cpfData.nome      || socioAdmin.nome,
        idade:     cpfData.idade,
        renda:     cpfData.renda,
        telefones: cpfData.telefones,
      }
    } catch { /* opcional */ }
  } else {
    // Fallback: usa dados da empresa
    socioAdmin = {
      nome:        socioAdmin?.nome || razaoSocial,
      cpf:         '',
      qualificacao: socioAdmin?.qualificacao ?? '',
      idade:       null,
      renda:       '',
      telefones,
    }
  }

  return { cnpj: cnpjLimpo, razaoSocial, nomeFantasia, situacao, capitalSocial, porte, abertura, telefones, socioAdmin, url }
}
