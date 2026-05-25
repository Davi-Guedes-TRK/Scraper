export default function Loading() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full" style={{ border: '2px solid var(--border)' }} />
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{ border: '2px solid transparent', borderTopColor: 'var(--primary)', animationDuration: '0.8s' }}
        />
      </div>
      <p className="eyebrow text-muted-foreground">Carregando…</p>
    </div>
  )
}
