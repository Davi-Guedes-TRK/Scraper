import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = [
  'img.dfimoveis.com.br',
  'img1.dfimoveis.com.br',
  'img2.dfimoveis.com.br',
  'img.olx.com.br',
  'images.olx.com.br',
  'img.olxcdn.com',
  'cdn.olxbr.com',
  'photos.zap.com.br',
]

const REFERER: Record<string, string> = {
  'dfimoveis.com.br': 'https://www.dfimoveis.com.br/',
  'olx.com.br': 'https://www.olx.com.br/',
  'olxcdn.com': 'https://www.olx.com.br/',
  'olxbr.com': 'https://www.olx.com.br/',
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('missing url', { status: 400 })

  let parsed: URL
  try { parsed = new URL(url) } catch { return new NextResponse('invalid url', { status: 400 }) }

  const allowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  if (!allowed) return new NextResponse('host not allowed', { status: 403 })

  const referer = Object.entries(REFERER).find(([domain]) => parsed.hostname.endsWith(domain))?.[1]
    ?? `https://${parsed.hostname}/`

  try {
    const res = await fetch(url, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (compatible; TRK-Mailer/1.0)',
      },
      // cache 1 hora
      next: { revalidate: 3600 },
    })

    if (!res.ok) return new NextResponse('upstream error', { status: 502 })

    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = await res.arrayBuffer()

    return new NextResponse(buf, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  } catch {
    return new NextResponse('fetch failed', { status: 502 })
  }
}
