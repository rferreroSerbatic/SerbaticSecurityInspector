import { OWASP_VULNS } from '../../data/owasp'
import { NeonButton } from '../ui/NeonButton'
import { VulnRow } from './VulnRow'

export function VulnSelectScreen({
  selected,
  onToggle,
  onSetAll,
  onRun,
  onBack,
}: {
  selected: string[]
  onToggle: (id: string) => void
  onSetAll: (ids: string[]) => void
  onRun: () => void
  onBack: () => void
}) {
  const total = OWASP_VULNS.length
  const count = OWASP_VULNS.filter(v => selected.includes(v.id)).length
  const allSelected = OWASP_VULNS.every(v => selected.includes(v.id))

  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 75% 15%, rgba(255,45,149,0.22), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(0,229,255,0.18), transparent 55%)',
        }}
      />
      <div className="relative max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
          PASO 2 · VULNERABILIDADES
        </p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <h1 className="bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-3xl font-extrabold leading-tight text-transparent sm:text-4xl">
            Elige qué vulnerabilidades auditar
          </h1>
          <NeonButton
            variant="outline"
            className="shrink-0"
            onClick={() => onSetAll(allSelected ? [] : OWASP_VULNS.map(v => v.id))}
          >
            {allSelected ? 'DESELECCIONAR TODAS' : 'SELECCIONAR TODAS'}
          </NeonButton>
        </div>

        <div className="mt-8 flex flex-col">
          {OWASP_VULNS.map(v => (
            <VulnRow
              key={v.id}
              vuln={v}
              selected={selected.includes(v.id)}
              onToggle={() => onToggle(v.id)}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan"
          >
            ← Volver
          </button>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">
              {count} DE {total} SELECCIONADAS
            </span>
            <NeonButton variant="primary" disabled={count === 0} onClick={onRun}>
              EJECUTAR ANÁLISIS ▸
            </NeonButton>
          </div>
        </div>
      </div>
    </section>
  )
}
