import Image from 'next/image'

export const APP_NAME = 'TRK Imóveis'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="TRK Imóveis"
      width={size}
      height={size}
      className="object-contain"
      priority
    />
  )
}

export function LogoHorizontal({ height = 28 }: { height?: number }) {
  return (
    <Image
      src="/logo-texto-lado.png"
      alt="TRK Imóveis"
      width={Math.round(height * 3.5)}
      height={height}
      className="object-contain"
      priority
    />
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <LogoHorizontal height={28} />
    </div>
  )
}
