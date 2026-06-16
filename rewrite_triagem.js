const fs = require('fs')
const path = 'app/(app)/triagem/triagem-client.tsx'
let code = fs.readFileSync(path, 'utf8')

function extractBlock(startMarker, endMarker) {
  const start = code.indexOf(startMarker)
  if (start === -1) throw new Error("Start not found: " + startMarker)
  let end = code.length
  if (endMarker) {
    end = code.indexOf(endMarker, start)
    if (end === -1) throw new Error("End not found: " + endMarker)
  }
  return { start, end, content: code.substring(start, end) }
}

const reviewPanelBlock = extractBlock('// ── ReviewPanel ─', '// ── StatsPanel ─')
code = code.substring(0, reviewPanelBlock.start) + `// ── ReviewPanel ────────────────────────────────────────────────────────────────
function ReviewPanel({ item, descricao, endereco, setEndereco, mapsLink, setMapsLink, resolving, setResolving, fonte, setFonte, setCoord, dups, onApprove, onVisitar, onDiscard, onClose }: {
  item: Imovel
  descricao: string | null
  endereco: string
  setEndereco: (s: string) => void
  mapsLink: string
  setMapsLink: (s: string) => void
  resolving: boolean
  setResolving: (b: boolean) => void
  fonte: string | null
  setFonte: (s: string | null) => void
  setCoord: (c: { lat: number; lng: number } | null) => void
  dups: string[]
  onApprove: (item: Imovel, data: { endereco: string; mapsLink: string; fonte?: string | null }) => Promise<void>
  onVisitar: (item: Imovel, data: { endereco: string; mapsLink: string; fonte?: string | null }) => Promise<void>
  onDiscard: (item: Imovel) => void
  onClose: () => void
}) {
  const imgs = allImgs(item.imagens)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [matriculaOpen, setMatriculaOpen] = useState(false)

  const MAPS_RE = /maps\\.app\\.goo\\.gl\\/|(?:www\\.)?google\\.com\\/maps/

  const handleMapsLinkChange = async (val: string) => {
    setMapsLink(val)
    if (!MAPS_RE.test(val)) return
    setResolving(true)
    try {
      const res = await fetch('/api/resolve-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: val }),
      })
      if (!res.ok) return
      const data: { endereco: string | null; mapsLink: string; lat?: number | null; lng?: number | null; source?: 'geoportal' | 'maps' | null } = await res.json()
      if (data.mapsLink) setMapsLink(data.mapsLink)
      if (data.endereco && (data.source === 'geoportal' || !endereco.trim())) setEndereco(data.endereco)
      setFonte(data.source ?? null)
      if (data.lat != null && data.lng != null) setCoord({ lat: data.lat, lng: data.lng })
    } catch { /* ignore */ } finally {
      setResolving(false)
    }
  }

  const preco = parsePreco(item.preco)
  const pistas = (item.pistas_ia ?? {}) as Record<string, unknown>
  const score = addressScore(item)

  const pistaFields = [
    { key: 'quadra', label: 'Quadra' },
    { key: 'conjunto', label: 'Conjunto' },
    { key: 'casa_lote', label: 'Casa/Lote' },
    { key: 'bairro_confirmado', label: 'Bairro' },
    { key: 'outros_indicios', label: 'Indícios' },
  ].filter(f => pistas[f.key])

  const canSave = !saving && !!endereco.trim()
  const approve = async () => { setSaving(true); await onApprove(item, { endereco, mapsLink, fonte }); setSaving(false) }
  const visitar = async () => { setSaving(true); await onVisitar(item, { endereco, mapsLink, fonte }); setSaving(false) }
  const discard = () => { onDiscard(item) }
  const fsbo = classifyAnunciante(item)

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── header ── */}
        <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
          {item.sem_exclusividade && (
            <div className="px-4 py-1.5 flex items-center gap-2"
              style={{ background: 'color-mix(in srgb, var(--chart-1) 10%, var(--card))', borderBottom: '1px solid color-mix(in srgb, var(--chart-1) 25%, transparent)' }}>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--chart-1)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--chart-1)' }}>
                Sem exclusividade · anunciado por múltiplas corretoras
              </span>
            </div>
          )}
          {dups.length > 0 && (
            <div className="px-4 py-1.5 flex items-center gap-2"
              style={{ background: 'color-mix(in srgb, #f59e0b 12%, var(--card))', borderBottom: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)' }}>
              <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.378c.866-1.5 3.032-1.5 3.898 0L21.303 16.126z" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: '#92400e' }}>
                Duplicata · também em {dups.map(portalLabel).join(', ')}
              </span>
            </div>
          )}

          <div className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <PortalBadge portal={item.portal} />
                  {fsbo === 'proprietario' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--approve-bg)', color: 'var(--approve-fg)' }}>Proprietário</span>
                  )}
                  {fsbo === 'corretor' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Corretor</span>
                  )}
                  {item.sem_exclusividade && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--chart-1) 15%, transparent)', color: 'var(--chart-1)' }}>Sem exclusividade</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground leading-tight">{item.titulo || '(sem título)'}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {[item.bairro, item.cidade?.replace(/-/g, ' ')].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button onClick={onClose}
                className="text-muted-foreground hover:text-foreground w-6 h-6 flex items-center justify-center rounded transition-colors flex-shrink-0"
                aria-label="Fechar">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-sm font-bold text-foreground tabular">{preco ? fmtBRL(preco) : item.preco || '—'}</span>
              {item.area_m2 && <span className="text-[11px] text-muted-foreground">{item.area_m2} m²</span>}
              {item.quartos && <span className="text-[11px] text-muted-foreground">{item.quartos} qtos</span>}
              <a href={item.link} target="_blank" rel="noreferrer" className="ml-auto text-[10px] text-primary hover:underline">Ver anúncio ↗</a>
            </div>
          </div>
        </div>

        {/* ── grade de fotos 3×2 ── */}
        {imgs.length > 0 ? (
          <div className="flex-shrink-0 h-[240px] grid gap-px"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', background: 'var(--border)' }}>
            {imgs.slice(0, 6).map((src, i) => (
              <button key={i} onClick={() => { setZoomIdx(i); setZoom(true) }}
                className="relative overflow-hidden bg-zinc-900 group h-full w-full">
                <img src={src} alt="" referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                {i === 5 && imgs.length > 6 && (
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">+{imgs.length - 6}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-shrink-0 h-20 flex items-center justify-center text-muted-foreground/30" style={{ background: 'var(--muted)' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
          </div>
        )}

        {/* ── corpo scrollável — pistas + descrição ── */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
          {pistaFields.length > 0 && (
            <div className="rounded-lg p-2.5 border" style={{ background: 'color-mix(in srgb, #f59e0b 8%, var(--card))', borderColor: 'color-mix(in srgb, #f59e0b 30%, transparent)' }}>
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 font-mono">Pistas da IA</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {pistaFields.map(({ key, label }) => (
                  <div key={key}>
                    <span className="text-[9px] text-amber-500 uppercase font-mono">{label}</span>
                    <p className="text-[11px] text-foreground font-medium leading-tight">{String(pistas[key])}</p>
                  </div>
                ))}
              </div>
              {Array.isArray((pistas as Record<string, unknown>).pontos_referencia) &&
                ((pistas as Record<string, string[]>).pontos_referencia).length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1.5">
                    {((pistas as Record<string, string[]>).pontos_referencia).join(' · ')}
                  </p>
              )}
            </div>
          )}

          {descricao && (
            <div className="rounded-lg border border-border overflow-hidden" style={{ background: 'var(--muted)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wider px-2.5 pt-2 pb-0.5 font-mono text-muted-foreground">
                {item.portal === 'olx' ? 'Características' : 'Descrição'}
              </p>
              <div className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line px-2.5 pb-2 max-h-28 overflow-y-auto">
                {descricao}
              </div>
            </div>
          )}
        </div>

        {/* ── endereço sticky (acima das ações) ── */}
        <div className="flex-shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--card)' }}>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[11px] font-semibold text-foreground">
                Endereço <span className="text-destructive">*</span>
              </label>
              {score > 0 && (
                <span className={\`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none \${
                  score >= 5 ? 'bg-green-100 text-green-700' :
                  score >= 3 ? 'bg-amber-100 text-amber-700' :
                  'bg-zinc-100 text-zinc-500'
                }\`}>
                  {score}/6
                </span>
              )}
              {!endereco.trim() && (
                <span className="text-[9px] text-muted-foreground/50 ml-auto font-mono">obrigatório p/ aprovar</span>
              )}
            </div>
            <div className="flex gap-1">
              <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder="QL 14 Conjunto 3 Casa 12, Lago Sul"
                className="flex-1 bg-muted border border-border text-foreground text-xs rounded-lg px-3 py-1.5 outline-none focus:border-foreground/50 placeholder-muted-foreground/50 transition-colors" />
              <button onClick={() => { if (endereco.trim()) navigator.clipboard.writeText(endereco) }}
                title="Copiar"
                className="px-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative">
            <input type="url" value={mapsLink} onChange={e => handleMapsLinkChange(e.target.value)}
              placeholder="Link Google Maps (opcional)"
              className="w-full bg-muted border border-border text-foreground text-xs rounded-lg px-3 py-1.5 outline-none focus:border-foreground/50 placeholder-muted-foreground/50 transition-colors pr-7" />
            {resolving && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-3 h-3 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </span>
            )}
          </div>

          {/* keyboard hints */}
          <div className="flex gap-3 flex-wrap">
            {[
              { key: 'A', label: 'Aprovar', dim: !canSave },
              { key: 'V', label: 'Visitar', dim: !canSave },
              { key: 'D', label: 'Descartar', dim: false },
              { key: '↑↓', label: 'Navegar', dim: false },
            ].map(k => (
              <span key={k.key} className={\`flex items-center gap-1 text-[9px] font-mono transition-opacity \${k.dim ? 'opacity-30' : 'text-muted-foreground'}\`}>
                <kbd className="px-1 py-0.5 rounded border border-border text-[9px] bg-muted leading-none">{k.key}</kbd>
                {k.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── ações ── */}
        <div className="flex gap-2 p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={discard} disabled={saving}
            className="px-4 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 hover:opacity-90 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
            style={{ background: 'var(--discard-bg)', color: 'var(--discard-fg)' }}>
            Descartar
          </button>
          <button onClick={visitar} disabled={!canSave}
            className="px-4 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 flex-shrink-0 cursor-pointer flex items-center gap-1.5"
            style={{ background: 'color-mix(in srgb, #0ea5e9 18%, var(--card))', color: '#0ea5e9', border: '1px solid color-mix(in srgb, #0ea5e9 40%, transparent)' }}>
            {saving && <Spinner />}
            Visitar
          </button>
          <button onClick={approve} disabled={!canSave}
            className="flex-1 h-11 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5"
            style={{ background: 'var(--approve-bg)', color: 'var(--approve-fg)' }}>
            {saving && <Spinner />}
            Aprovar
          </button>
        </div>
      </div>

      {zoom && <Lightbox imgs={imgs} startIdx={zoomIdx} title={item.titulo} onClose={() => setZoom(false)} />}
      {matriculaOpen && <MatriculaModal item={item} onClose={() => setMatriculaOpen(false)} />}
    </>
  )
}
` + '\n' + code.substring(reviewPanelBlock.end)

// Add GeoportalCandidates and ContextSidebar right above StatsPanel
const statsPanelSearch = '// ── StatsPanel ─────────────────────────────────────────────────────────────────\n'
const sidebarBlocks = `// ── GeoportalCandidates ────────────────────────────────────────────────────────
function GeoportalCandidates({ item, descricao, endereco, setEndereco, fonte, setFonte, setCoord }: {
  item: Imovel
  descricao: string | null
  endereco: string
  setEndereco: (s: string) => void
  fonte: string | null
  setFonte: (s: string | null) => void
  setCoord: (c: { lat: number; lng: number } | null) => void
}) {
  type CandGeo = { endereco: string | null; score: number; loteMatch: boolean; centro?: [number, number] | null; lote: { area_proj: number | null; end_cart: string | null } }
  const [candidatos, setCandidatos] = useState<CandGeo[]>([])
  const [candConf, setCandConf] = useState<string | null>(null)
  const [buscandoCand, setBuscandoCand] = useState(false)

  useEffect(() => {
    setCandidatos([]); setCandConf(null)
    const txt = \`\${item.bairro ?? ''} \${item.titulo ?? ''}\`.trim()
    const { setor, quadra, conjunto, casa_lote } = parseEnderecoDF(txt)
    const area_m2 = item.area_m2 ? parseFloat(String(item.area_m2).replace(',', '.')) : undefined

    let enrichedDone = false

    const chamarCandidatos = (desc?: string) => {
      if (!quadra || !ehCasaLote(item.tipo_imovel)) return
      const isEnriched = !!desc
      setBuscandoCand(true)
      fetch('/api/geoportal/candidatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setor, quadra, conjunto, casa_lote, endereco: txt, area_m2, ...(desc ? { descricao: desc } : {}) }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (j && (!enrichedDone || isEnriched)) {
            if (isEnriched) enrichedDone = true
            setCandidatos((j.candidatos ?? []).slice(0, 6))
            setCandConf(j.confianca ?? null)
          }
        })
        .catch(() => {})
        .finally(() => setBuscandoCand(false))
    }

    chamarCandidatos()
    if (descricao) chamarCandidatos(descricao)
  }, [item.link, descricao]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!buscandoCand && candidatos.length === 0) return null

  return (
    <div className="rounded-lg p-2.5 border" style={{ background: 'color-mix(in srgb, var(--chart-1) 7%, var(--card))', borderColor: 'color-mix(in srgb, var(--chart-1) 30%, transparent)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-[9px] font-bold uppercase tracking-wider font-mono" style={{ color: 'var(--chart-1)' }}>Candidatos do Geoportal</p>
        {candConf && (
          <span className={\`text-[8px] px-1 py-0.5 rounded font-mono font-bold uppercase leading-none \${
            candConf === 'alta' ? 'bg-green-100 text-green-700' :
            candConf === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'
          }\`}>{candConf}</span>
        )}
        {buscandoCand && (
          <svg className="w-3 h-3 animate-spin text-muted-foreground ml-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {candidatos.map((c, i) => {
          const end = c.endereco ?? c.lote.end_cart
          const sel = !!end && endereco === end && fonte === 'geoportal'
          return (
            <button key={i} onClick={() => { if (end) { setEndereco(end); setFonte('geoportal'); if (c.centro) setCoord({ lat: c.centro[1], lng: c.centro[0] }) } }}
              className={\`w-full text-left rounded-md px-2 py-1.5 border transition-colors \${sel ? 'border-[var(--chart-1)] bg-[var(--chart-1)]/10' : 'border-border hover:bg-muted'}\`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-foreground font-medium truncate flex-1">{end ?? '—'}</span>
                {c.loteMatch && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 shrink-0 leading-none">lote ✓</span>}
                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: 'var(--chart-1)' }}>{Math.round(c.score * 100)}%</span>
              </div>
              {c.lote.area_proj != null && <span className="text-[9px] text-muted-foreground font-mono">{c.lote.area_proj}m²</span>}
            </button>
          )
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/60 mt-1.5">clique para preencher o endereço (marca confiança Geoportal)</p>
    </div>
  )
}

// ── ContextSidebar ─────────────────────────────────────────────────────────────
function ContextSidebar({ 
  item, descricao, endereco, setEndereco, fonte, setFonte, coord, setCoord, items, total
}: {
  item: Imovel | null
  descricao: string | null
  endereco: string
  setEndereco: (s: string) => void
  fonte: string | null
  setFonte: (s: string | null) => void
  coord: { lat: number; lng: number } | null
  setCoord: (c: { lat: number; lng: number } | null) => void
  items: Imovel[]
  total: number
}) {
  if (!item) {
    return <StatsPanel items={items} total={total} reviewItem={null} />
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <StatsPanel items={items} total={total} reviewItem={item} />
      
      <div className="px-4 py-3 flex flex-col gap-3 flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <GeoportalCandidates 
          item={item} 
          descricao={descricao} 
          endereco={endereco} 
          setEndereco={setEndereco}
          fonte={fonte}
          setFonte={setFonte}
          setCoord={setCoord}
        />
        {coord && <FichaImovel coord={coord} />}
        {coord && <MapillaryStrip coord={coord} />}
      </div>
    </div>
  )
}

`
code = code.replace(statsPanelSearch, sidebarBlocks + statsPanelSearch)

// TriagemClient States
code = code.replace(
  `  const [reviewItem, setReviewItem] = useState<Imovel | null>(null)`,
  `  const [reviewItem, setReviewItem] = useState<Imovel | null>(null)
  const [reviewResolving, setReviewResolving] = useState(false)
  const [reviewFonte, setReviewFonte] = useState<string | null>(null)
  const [reviewCoord, setReviewCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [reviewDescricao, setReviewDescricao] = useState<string | null>(null)`
)

// TriagemClient effect
const oldEffect = `  // Populate endereço from pistas when selected item changes
  useEffect(() => {
    if (!reviewItem) return
    const p = (reviewItem.pistas_ia ?? {}) as Record<string, string>
    const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean)
    setReviewEndereco(parts.length ? parts.join(', ') : '')
    setReviewMapsLink('')
  }, [reviewItem?.link]) // eslint-disable-line react-hooks/exhaustive-deps`

const newEffect = `  // Populate endereço from pistas and fetch descrição
  useEffect(() => {
    if (!reviewItem) {
      setReviewEndereco('')
      setReviewMapsLink('')
      setReviewFonte(null)
      setReviewCoord(null)
      setReviewDescricao(null)
      return
    }

    const p = (reviewItem.pistas_ia ?? {}) as Record<string, string>
    const parts = [p.quadra, p.conjunto, p.casa_lote].filter(Boolean)
    setReviewEndereco(reviewItem.endereco || (parts.length ? parts.join(', ') : ''))
    setReviewMapsLink(reviewItem.maps_link || '')
    setReviewFonte(reviewItem.endereco_fonte || null)
    setReviewCoord(reviewItem.lat && reviewItem.lng ? { lat: reviewItem.lat, lng: reviewItem.lng } : null)
    setReviewDescricao(null)

    let vivo = true
    fetch(\`/api/triagem/detalhe?link=\${encodeURIComponent(reviewItem.link)}\`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (vivo && d?.descricao) setReviewDescricao(d.descricao)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [reviewItem?.link]) // eslint-disable-line react-hooks/exhaustive-deps`

code = code.replace(oldEffect, newEffect)

// TriagemClient JSX replacement
code = code.replace(
  `<ReviewPanel
            item={reviewItem}
            endereco={reviewEndereco}
            setEndereco={setReviewEndereco}
            mapsLink={reviewMapsLink}
            setMapsLink={setReviewMapsLink}
            dups={dupPortals(reviewItem)}
            onApprove={handleApprove}
            onVisitar={handleVisitar}
            onDiscard={handleDiscard}
            onClose={() => setReviewItem(null)}
          />`,
  `<ReviewPanel
            item={reviewItem}
            descricao={reviewDescricao}
            endereco={reviewEndereco}
            setEndereco={setReviewEndereco}
            mapsLink={reviewMapsLink}
            setMapsLink={setReviewMapsLink}
            resolving={reviewResolving}
            setResolving={setReviewResolving}
            fonte={reviewFonte}
            setFonte={setReviewFonte}
            setCoord={setReviewCoord}
            dups={dupPortals(reviewItem)}
            onApprove={handleApprove}
            onVisitar={handleVisitar}
            onDiscard={handleDiscard}
            onClose={() => setReviewItem(null)}
          />`
)

code = code.replace(
  `<StatsPanel items={items} total={total} reviewItem={reviewItem} />`,
  `<ContextSidebar 
          item={reviewItem}
          descricao={reviewDescricao}
          endereco={reviewEndereco}
          setEndereco={setReviewEndereco}
          fonte={reviewFonte}
          setFonte={setReviewFonte}
          coord={reviewCoord}
          setCoord={setReviewCoord}
          items={items}
          total={total}
        />`
)

code = code.replace('w-[240px] flex-shrink-0 flex flex-col', 'w-[280px] flex-shrink-0 flex flex-col')

fs.writeFileSync(path, code)
console.log("Success")
