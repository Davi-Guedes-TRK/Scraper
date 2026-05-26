import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  const logo = readFileSync(join(process.cwd(), 'public', 'logo-mark.png'))
  const src = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 64,
          height: 64,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
      </div>
    ),
    { width: 64, height: 64 }
  )
}
