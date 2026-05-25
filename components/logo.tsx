import Image from 'next/image'

export const APP_NAME = 'ELO'

// mix-blend-multiply: apaga o fundo branco no light mode (sidebar #f7f7f7)
// dark:invert: inverte para branco no dark mode (sidebar #111)
// dark:mix-blend-normal: desativa o multiply no dark para não sumir
const logoClass = 'object-contain mix-blend-multiply dark:mix-blend-normal dark:invert'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="ELO"
      width={size}
      height={size}
      className={logoClass}
      priority
    />
  )
}

export function LogoHorizontal({ height = 28 }: { height?: number }) {
  return (
    <Image
      src="/logo-texto-lado.png"
      alt="ELO Sistema Imobiliário"
      width={Math.round(height * 3.8)}
      height={height}
      className={logoClass}
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
