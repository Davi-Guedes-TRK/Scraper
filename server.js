require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const app = express()
app.disable('x-powered-by')
const PORT = process.env.PORT || 3001

// Diretório raiz onde fica o main.py
const GIT_DIR = process.env.GIT_DIR || path.resolve(__dirname, '..')
const PYTHON = process.env.PYTHON_PATH || 'python'

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json())

// Serve fotos baixadas pelo scraper
app.use('/fotos', express.static(path.join(GIT_DIR, 'imagens')))

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Remove códigos ANSI (cores do Rich/terminal) para exibição no browser
const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[mGKHFJA-Z]/g, '')

const SYSTEM_PROMPT = `Você é um assistente especializado em imóveis do Lago Sul, Brasília/DF.
Analise a descrição abaixo e extraia APENAS informações que ajudem a identificar o endereço físico do imóvel.
Retorne SOMENTE um JSON válido sem markdown:
{
  "quadra": "QL 14 ou QI 9 ou null",
  "conjunto": "Conjunto 3 ou null",
  "casa_lote": "Casa 12 ou Lote 4 ou null",
  "pontos_referencia": ["próximo ao clube X", "esquina com Y"],
  "bairro_confirmado": true,
  "outros_indicios": "qualquer outra pista de localização encontrada no texto",
  "confianca": "alta, media ou baixa"
}`

// ── GET /api/health ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() })
})

// Regiões TRK padrão — DFImóveis executa em sequência para cada uma
const TRK_CIDADES = [
  'lago-sul', 'park-sul', 'park-way', 'asa-sul', 'asa-norte',
  'jardim-botanico', 'lago-norte', 'sudoeste', 'noroeste',
]

// ── Allowlists para validação de parâmetros do scraper ────────────────────────
// Uso de indexOf + acesso por índice numérico: o output é do nosso array estático,
// nunca do input do usuário — quebra o taint tracking do SonarCloud (S6350/S5145).
const VALID_PORTALS     = ['dfimoveis', 'olx', 'wimoveis']
const VALID_TIPOS       = ['venda', 'aluguel', 'todos']
const VALID_TIPO_IMOVEL = ['todos', 'apartamento', 'casa', 'terreno', 'comercial', 'kitnet', 'cobertura']
const VALID_ESTADOS     = ['df', 'go', 'mg', 'sp', 'rj', 'ba', 'pr', 'rs', 'sc', 'pe', 'ce', 'es', 'am']
const VALID_CIDADES     = [...TRK_CIDADES, 'todos', 'trk-preset']

function pickFrom(list, raw, fallback) {
  const idx = list.indexOf(String(raw ?? '').toLowerCase().trim())
  return idx === -1 ? fallback : list[idx]
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10)
  return (Number.isNaN(n) || n < min || n > max) ? fallback : n
}

// ── GET /api/scrapers/run  (SSE — streaming de logs em tempo real) ─────────────
// Params: portal, paginas, cidade, tipo, tipo_imovel, estado
app.get('/api/scrapers/run', (req, res) => {
  const portal      = pickFrom(VALID_PORTALS,     req.query.portal,      'dfimoveis')
  const tipo        = pickFrom(VALID_TIPOS,        req.query.tipo,        'venda')
  const tipo_imovel = pickFrom(VALID_TIPO_IMOVEL,  req.query.tipo_imovel, 'todos')
  const estado      = pickFrom(VALID_ESTADOS,      req.query.estado,      'df')
  const cidade      = pickFrom(VALID_CIDADES,      req.query.cidade,      'todos')
  const paginas     = clampInt(req.query.paginas,      1,   200, 10)
  const publicados_ha = clampInt(req.query.publicados_ha, 0, 365,  0)
  const fast        = req.query.fast === 'true'

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  // Lista de cidades a percorrer (preset ou única)
  const cidades = (cidade === 'trk-preset' && portal === 'dfimoveis')
    ? TRK_CIDADES
    : [cidade]

  let currentChild = null
  let aborted = false

  req.on('close', () => {
    aborted = true
    if (currentChild && !currentChild.killed) currentChild.kill()
  })

  const runCidade = (cidadeSlug) => new Promise((resolve) => {
    const args = ['main.py', portal, `--paginas=${paginas}`]
    if (fast) args.push('--fast')
    if (publicados_ha > 0) args.push(`--publicados-ha=${publicados_ha}`)
    if (portal === 'dfimoveis') {
      args.push(`--cidade=${cidadeSlug}`, `--tipo=${tipo}`, `--tipo-imovel=${tipo_imovel}`)
    } else if (portal === 'olx') {
      args.push(`--tipo=${tipo}`, `--estado=${estado}`)
    } else if (portal === 'wimoveis') {
      args.push(`--tipo=${tipo}`)
    }

    send({ type: 'start', cidade: cidadeSlug })
    console.log('[Scraper] iniciando processo')

    const child = spawn(PYTHON, args, {
      cwd: GIT_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    })
    currentChild = child

    const onData = (data) => {
      stripAnsi(data.toString()).split('\n').forEach((line) => {
        const text = line.trimEnd()
        if (text) send({ type: 'log', text })
      })
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => { console.log(`[Scraper] ${cidadeSlug} encerrou (${code})`); resolve(code) })
    child.on('error', (err) => { send({ type: 'log', text: `❌ Falha: ${err.message}` }); resolve(1) })
  })

  ;(async () => {
    for (let i = 0; i < cidades.length; i++) {
      if (aborted) break
      if (cidades.length > 1) {
        send({ type: 'log', text: `\n━━━ [${i + 1}/${cidades.length}] ${cidades[i].toUpperCase()} ━━━` })
      }
      await runCidade(cidades[i])
      if (aborted) break
    }
    if (!aborted) {
      send({ type: 'done', code: 0 })
      res.end()
    }
  })()
})

// ── POST /api/extrair-pistas ───────────────────────────────────────────────────
app.post('/api/extrair-pistas', async (req, res) => {
  const { descricao } = req.body
  if (!descricao || !descricao.trim()) {
    return res.status(400).json({ error: 'Campo descricao é obrigatório.' })
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nDescrição:\n${descricao.slice(0, 4000)}`)
    const raw = result.response.text()

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Resposta não contém JSON válido')
    const pistas = JSON.parse(match[0])

    res.json({ pistas })
  } catch (err) {
    console.error('[Gemini]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/geocodificar ────────────────────────────────────────────────────
// Geocodifica um endereço usando Nominatim (OSM). Retorna { lat, lng, endereco_norm }.
app.post('/api/geocodificar', async (req, res) => {
  const { endereco } = req.body
  if (!endereco?.trim()) return res.status(400).json({ error: 'endereco é obrigatório' })

  try {
    const q = encodeURIComponent(`${endereco.trim()}, Brasília, DF, Brasil`)
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=br&limit=1`
    const r = await fetch(url, { headers: { 'User-Agent': 'PainelCaptacao/1.0 TRK-Imoveis' } })
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`)
    const data = await r.json()
    if (!data.length) return res.status(404).json({ error: 'Endereço não encontrado pelo Nominatim' })

    const { lat, lon, display_name } = data[0]
    res.json({ lat: parseFloat(lat), lng: parseFloat(lon), endereco_norm: display_name })
  } catch (err) {
    console.error('[Nominatim]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/analisar-imagens ────────────────────────────────────────────────
// Body: { imgs: ["imagens/123/foto_1.jpg", "https://..."] }
app.post('/api/analisar-imagens', async (req, res) => {
  const { imgs = [] } = req.body
  if (!imgs.length) return res.status(400).json({ error: 'Nenhuma imagem enviada.' })

  const PROMPT_IMAGEM = `Você é um assistente especializado em identificar endereços de imóveis no DF (Brasília).
Analise as imagens e procure por textos visíveis que indiquem localização, como:
- Número ou letra de bloco (ex: "Bloco C", "BL C", "BLOCO 3")
- Número de apartamento (ex: "Apt 16", "Apto 205", "AP 12")
- Número de casa ou lote visível em placa ou fachada
- Placas de endereço, interfone com numeração, letreiros na entrada
Retorne SOMENTE um JSON válido sem markdown:
{
  "encontrou_dados": true,
  "bloco": "C ou null",
  "apartamento": "16 ou null",
  "casa_lote": "12 ou null",
  "textos_encontrados": ["Bloco C", "Apt 16"],
  "confianca": "alta, media ou baixa",
  "descricao": "breve descrição do que foi encontrado"
}`

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Monta partes de imagem (até 6 fotos para não estourar token)
    const parts = [{ text: PROMPT_IMAGEM }]
    let count = 0
    for (const src of imgs) {
      if (count >= 6) break
      try {
        let data, mime = 'image/jpeg'
        if (src.startsWith('http')) {
          const r = await fetch(src)
          if (!r.ok) continue
          data = Buffer.from(await r.arrayBuffer()).toString('base64')
        } else {
          const localPath = path.join(GIT_DIR, src.replace(/^imagens\//, 'imagens/'))
          if (!fs.existsSync(localPath)) continue
          data = fs.readFileSync(localPath).toString('base64')
        }
        parts.push({ inlineData: { mimeType: mime, data } })
        count++
      } catch { continue }
    }

    if (count === 0) return res.json({ pistas: { encontrou_dados: false, descricao: 'Nenhuma imagem acessível.' } })

    const result = await model.generateContent(parts)
    const raw = result.response.text()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Resposta não contém JSON válido')
    const pistas = JSON.parse(match[0])
    res.json({ pistas })
  } catch (err) {
    console.error('[Gemini Vision]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`\n🟢 Backend rodando em http://localhost:${PORT}`)
  console.log(`   GIT_DIR: ${GIT_DIR}`)
  console.log(`   Python:  ${PYTHON}\n`)
})
