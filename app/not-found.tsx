import Link from 'next/link'

export const metadata = { title: 'Página não encontrada · Velvet' }

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 page-bg">
      <div className="max-w-md w-full text-center page-enter">
        <p className="font-display font-extrabold text-primary tracking-tight" style={{ fontSize: '5rem', lineHeight: 1 }}>
          404
        </p>
        <h1 className="text-xl font-bold text-foreground font-display mt-3 mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground text-sm mb-7">O endereço que você procura não existe ou foi movido.</p>

        <Link
          href="/dashboard"
          className="btn-primary inline-flex items-center justify-center h-11 px-7 rounded-lg text-sm font-bold cursor-pointer"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  )
}
