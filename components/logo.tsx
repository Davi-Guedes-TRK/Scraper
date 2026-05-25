export const APP_NAME = 'TRK Imóveis'

export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 L21 7 L12 12 L3 7 Z" opacity="0.55" />
      <path d="M3 7 L12 12 L12 22 L3 17 Z" opacity="1" />
      <path d="M21 7 L12 12 L12 22 L21 17 Z" opacity="0.8" />
    </svg>
  )
}

export function Logo({
  className = '',
  markClass = 'w-7 h-7',
  textClass = 'text-lg',
}: {
  className?: string
  markClass?: string
  textClass?: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClass} />
      <span className={`font-bold tracking-tight ${textClass}`}>{APP_NAME}</span>
    </div>
  )
}
