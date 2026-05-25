export default function FunilPage() {
  return (
    <div className="flex flex-col h-full p-4 gap-3" style={{ minHeight: 0 }}>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Funil de Captação</h1>
        <p className="text-[13px] text-muted-foreground">Acompanhamento do pipeline — da oportunidade à captação.</p>
      </div>
      <div className="flex-1 rounded-xl overflow-hidden border border-border" style={{ minHeight: 600 }}>
        <iframe
          src="https://dguedes.grafana.net/public-dashboards/3d4eda6968cd4941b0f663de82588820?theme=light"
          width="100%"
          height="100%"
          style={{ minHeight: 600, border: 'none', display: 'block' }}
          title="Funil de Captação — TRK Imóveis"
          allowFullScreen
        />
      </div>
    </div>
  )
}
