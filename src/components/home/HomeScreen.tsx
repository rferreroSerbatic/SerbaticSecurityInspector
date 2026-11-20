import { NeonButton } from '../ui/NeonButton'

export function HomeScreen({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center">
      <div className="relative max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
          OWASP TOP 10 · AUDITORÍA AUTOMATIZADA
        </p>
        <h1 className="mt-4 bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-4xl font-extrabold leading-tight text-transparent sm:text-5xl">
          Encuentra la brecha antes que el atacante.
        </h1>
        <p className="mt-4 text-sm text-ink-dim">
          Análisis con agentes especializados, informe y alcance de mejora.
        </p>
        <div className="mt-8">
          <NeonButton variant="primary" onClick={onAnalyze}>
            ANALIZAR APLICACIÓN
          </NeonButton>
        </div>
        <div className="mt-12 flex flex-wrap gap-8 text-xs tracking-[0.15em] text-ink-dim">
          <span>
            <span className="text-sm font-bold text-neon-cyan">10</span> AGENTES
          </span>
          <span>
            <span className="text-sm font-bold text-neon-magenta">PDF</span>{' '}
            INFORME
          </span>
          <span>
            <span className="text-sm font-bold text-neon-cyan">GIT</span> ·
            CARPETA
          </span>
        </div>
      </div>
    </section>
  )
}
